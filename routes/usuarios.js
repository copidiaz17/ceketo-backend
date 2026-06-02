import { Router } from 'express'
import bcrypt from 'bcryptjs'
import Usuario from '../models/Usuario.js'
import { requireAuth } from './auth.js'

const router = Router()

function requireAdmin(req, res, next) {
  if (req.admin?.rol !== 'admin') return res.status(403).json({ error: 'Acceso denegado' })
  next()
}

// GET /api/usuarios
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = await Usuario.findAll({ attributes: ['id', 'usuario', 'rol', 'activo'] })
    res.json(users)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/usuarios
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { usuario, password, rol, activo } = req.body
    if (!usuario || !password || !rol) {
      return res.status(400).json({ error: 'Campos obligatorios: usuario, password, rol' })
    }
    const hash = await bcrypt.hash(password, 10)
    const user = await Usuario.create({ usuario, password: hash, rol, activo: activo !== false })
    res.json({ id: user.id, usuario: user.usuario, rol: user.rol, activo: user.activo })
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ error: 'El usuario ya existe' })
    }
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/usuarios/:id
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const user = await Usuario.findByPk(req.params.id)
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' })

    // No-admins solo pueden cambiar su propia contraseña
    if (req.admin.rol !== 'admin' && req.admin.usuario !== user.usuario) {
      return res.status(403).json({ error: 'Acceso denegado' })
    }

    const updates = {}
    if (req.body.password) updates.password = await bcrypt.hash(req.body.password, 10)
    if (req.admin.rol === 'admin') {
      if (req.body.usuario !== undefined) updates.usuario = req.body.usuario
      if (req.body.rol !== undefined) updates.rol = req.body.rol
      if (req.body.activo !== undefined) updates.activo = req.body.activo
    }

    await user.update(updates)
    res.json({ id: user.id, usuario: user.usuario, rol: user.rol, activo: user.activo })
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ error: 'El usuario ya existe' })
    }
    res.status(500).json({ error: err.message })
  }
})

export default router
