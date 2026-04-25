import { Router } from 'express'
import Insumo from '../models/Insumo.js'
import { requireAuth } from './auth.js'

const router = Router()
router.use(requireAuth)

// GET /api/insumos
router.get('/', async (req, res) => {
  try {
    const insumos = await Insumo.findAll({
      where: { activo: true },
      order: [['nombre', 'ASC']],
    })
    res.json(insumos)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/insumos/todos (incluye inactivos, para ABM)
router.get('/todos', async (req, res) => {
  try {
    const insumos = await Insumo.findAll({ order: [['nombre', 'ASC']] })
    res.json(insumos)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/insumos
router.post('/', async (req, res) => {
  try {
    const { nombre, unidad, costo_unitario } = req.body
    if (!nombre?.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' })
    const insumo = await Insumo.create({
      nombre: nombre.trim(),
      unidad: unidad?.trim() || 'unidad',
      costo_unitario: parseFloat(costo_unitario) || 0,
    })
    res.status(201).json(insumo)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/insumos/:id
router.put('/:id', async (req, res) => {
  try {
    const insumo = await Insumo.findByPk(req.params.id)
    if (!insumo) return res.status(404).json({ error: 'Insumo no encontrado' })
    const { nombre, unidad, costo_unitario, activo } = req.body
    await insumo.update({
      nombre:         nombre?.trim() ?? insumo.nombre,
      unidad:         unidad?.trim() ?? insumo.unidad,
      costo_unitario: costo_unitario != null ? parseFloat(costo_unitario) : insumo.costo_unitario,
      activo:         activo != null ? Boolean(activo) : insumo.activo,
    })
    res.json(insumo)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/insumos/:id (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const insumo = await Insumo.findByPk(req.params.id)
    if (!insumo) return res.status(404).json({ error: 'Insumo no encontrado' })
    await insumo.update({ activo: false })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
