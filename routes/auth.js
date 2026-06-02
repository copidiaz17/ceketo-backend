import { Router } from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import rateLimit from 'express-rate-limit'
import Usuario from '../models/Usuario.js'

const router = Router()

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de login. Intentá en 15 minutos.' },
})

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await Usuario.findOne({
      where: { usuario: req.admin.usuario },
      attributes: ['id', 'usuario', 'rol', 'activo'],
    })
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' })
    res.json(user)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { usuario, password } = req.body
    const user = await Usuario.findOne({ where: { usuario: usuario?.trim().toLowerCase(), activo: true } })
    if (!user) return res.status(401).json({ error: 'Credenciales incorrectas' })
    const ok = await bcrypt.compare(password, user.password)
    if (!ok) return res.status(401).json({ error: 'Credenciales incorrectas' })
    const token = jwt.sign({ usuario: user.usuario, rol: user.rol }, process.env.JWT_SECRET, { expiresIn: '8h' })
    res.json({ token, usuario: user.usuario, rol: user.rol })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Middleware de autenticación exportado para usar en otras rutas si se necesita
export function requireAuth(req, res, next) {
  const auth = req.headers.authorization
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'No autorizado' })
  try {
    const payload = jwt.verify(auth.slice(7), process.env.JWT_SECRET)
    req.admin = payload
    next()
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' })
  }
}

export default router
