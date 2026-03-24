import { Router } from 'express'
import Categoria from '../models/Categoria.js'
import { requireAuth } from './auth.js'

const router = Router()

// GET /api/categorias  (público — lo usa la tienda y el admin)
router.get('/', async (req, res) => {
  try {
    const cats = await Categoria.findAll({ order: [['nombre', 'ASC']] })
    res.json(cats)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/categorias  (admin)
router.post('/', requireAuth, async (req, res) => {
  try {
    const { codigo, nombre } = req.body
    if (!codigo || !nombre) return res.status(400).json({ error: 'Código y nombre son obligatorios' })
    const cat = await Categoria.create({ codigo: codigo.toUpperCase(), nombre })
    res.status(201).json(cat)
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ error: `El código "${req.body.codigo}" ya existe` })
    }
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/categorias/:id  (admin)
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const cat = await Categoria.findByPk(req.params.id)
    if (!cat) return res.status(404).json({ error: 'Categoría no encontrada' })
    const { codigo, nombre } = req.body
    const updates = {}
    if (codigo) updates.codigo = codigo.toUpperCase()
    if (nombre) updates.nombre = nombre
    await cat.update(updates)
    res.json(cat)
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ error: `El código "${req.body.codigo}" ya existe` })
    }
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/categorias/:id  (admin)
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const cat = await Categoria.findByPk(req.params.id)
    if (!cat) return res.status(404).json({ error: 'Categoría no encontrada' })
    await cat.destroy()
    res.json({ ok: true })
  } catch (err) {
    // FK constraint: tiene productos asociados
    if (err.name === 'SequelizeForeignKeyConstraintError') {
      return res.status(400).json({ error: 'No se puede eliminar: tiene productos asociados' })
    }
    res.status(500).json({ error: err.message })
  }
})

export default router
