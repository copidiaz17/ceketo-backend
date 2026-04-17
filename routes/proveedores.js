import { Router } from 'express'
import Proveedor from '../models/Proveedor.js'
import { requireAuth } from './auth.js'

const router = Router()
router.use(requireAuth)

// GET /api/proveedores
router.get('/', async (req, res) => {
  try {
    const proveedores = await Proveedor.findAll({ order: [['nombre', 'ASC']] })
    res.json(proveedores)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/proveedores
router.post('/', async (req, res) => {
  try {
    const { nombre, rubro, cuit, telefono, email, nota } = req.body
    if (!nombre?.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' })
    const proveedor = await Proveedor.create({ nombre: nombre.trim(), rubro, cuit, telefono, email, nota })
    res.status(201).json(proveedor)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/proveedores/:id
router.put('/:id', async (req, res) => {
  try {
    const proveedor = await Proveedor.findByPk(req.params.id)
    if (!proveedor) return res.status(404).json({ error: 'Proveedor no encontrado' })
    const { nombre, rubro, cuit, telefono, email, nota } = req.body
    if (nombre !== undefined && !nombre.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' })
    await proveedor.update({ nombre: nombre?.trim() ?? proveedor.nombre, rubro, cuit, telefono, email, nota })
    res.json(proveedor)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/proveedores/:id
router.delete('/:id', async (req, res) => {
  try {
    const proveedor = await Proveedor.findByPk(req.params.id)
    if (!proveedor) return res.status(404).json({ error: 'Proveedor no encontrado' })
    await proveedor.destroy()
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
