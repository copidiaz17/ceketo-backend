import { Router } from 'express'
import { sequelize } from '../database.js'
import Insumo from '../models/Insumo.js'
import MovimientoInsumo from '../models/MovimientoInsumo.js'
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
    const { nombre, unidad, costo_unitario, stock_minimo } = req.body
    if (!nombre?.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' })
    const insumo = await Insumo.create({
      nombre: nombre.trim(),
      unidad: unidad?.trim() || 'unidad',
      costo_unitario: parseFloat(costo_unitario) || 0,
      stock_minimo: parseFloat(stock_minimo) || 0,
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
    const { nombre, unidad, costo_unitario, activo, stock_minimo } = req.body
    // el stock NO se edita acá: se mueve con compras, producción o "Ajustar stock"
    await insumo.update({
      nombre:         nombre?.trim() ?? insumo.nombre,
      unidad:         unidad?.trim() ?? insumo.unidad,
      costo_unitario: costo_unitario != null ? parseFloat(costo_unitario) : insumo.costo_unitario,
      stock_minimo:   stock_minimo != null && stock_minimo !== '' ? parseFloat(stock_minimo) : insumo.stock_minimo,
      activo:         activo != null ? Boolean(activo) : insumo.activo,
    })
    res.json(insumo)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/insumos/:id/ajuste — conteo físico: deja el stock en lo que se contó y registra la diferencia
router.post('/:id/ajuste', async (req, res) => {
  const t = await sequelize.transaction()
  try {
    const insumo = await Insumo.findByPk(req.params.id, { transaction: t, lock: t.LOCK.UPDATE })
    if (!insumo) throw new Error('Insumo no encontrado')
    const nuevo = Number(req.body.stock_nuevo)
    if (req.body.stock_nuevo === '' || req.body.stock_nuevo == null || !(nuevo >= 0)) throw new Error('Indicá cuánto hay (0 o más)')
    const dif = Math.round((nuevo - Number(insumo.stock)) * 1000) / 1000
    await insumo.update({ stock: nuevo }, { transaction: t })
    if (dif !== 0) {
      await MovimientoInsumo.create({
        insumo_id: insumo.id, tipo: 'ajuste', cantidad: dif, stock_resultante: nuevo,
        referencia: (req.body.motivo || 'Ajuste por conteo').toString().slice(0, 120),
        usuario: req.admin?.usuario || null,
      }, { transaction: t })
    }
    await t.commit()
    res.json(insumo)
  } catch (err) {
    await t.rollback()
    res.status(400).json({ error: err.message })
  }
})

// GET /api/insumos/:id/movimientos — historial del stock del insumo
router.get('/:id/movimientos', async (req, res) => {
  try {
    const movs = await MovimientoInsumo.findAll({
      where: { insumo_id: req.params.id },
      order: [['fecha', 'DESC'], ['id', 'DESC']],
      limit: 300,
    })
    res.json(movs)
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
