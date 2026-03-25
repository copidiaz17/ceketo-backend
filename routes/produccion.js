import { Router } from 'express'
import { sequelize } from '../database.js'
import Produccion from '../models/Produccion.js'
import Producto from '../models/Producto.js'
import Categoria from '../models/Categoria.js'
import { requireAuth } from './auth.js'

const router = Router()
router.use(requireAuth)

// GET /api/produccion  - historial
router.get('/', async (req, res) => {
  try {
    const { fecha } = req.query
    const where = {}
    if (fecha) where.fecha = fecha

    const registros = await Produccion.findAll({
      where,
      include: [{
        model: Producto,
        as: 'producto',
        attributes: ['id', 'codigo', 'nombre'],
        include: [{ model: Categoria, as: 'categoria', attributes: ['codigo', 'nombre'] }],
      }],
      order: [['id', 'DESC']],
      limit: 200,
    })
    res.json(registros)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/produccion/lotes - historial agrupado por lote
router.get('/lotes', async (req, res) => {
  try {
    const registros = await Produccion.findAll({
      include: [{
        model: Producto, as: 'producto',
        attributes: ['id', 'codigo', 'nombre'],
        include: [{ model: Categoria, as: 'categoria', attributes: ['codigo', 'nombre'] }],
      }],
      order: [['id', 'DESC']],
      limit: 500,
    })

    // Agrupar por lote_id (o por fecha si no tiene lote_id)
    const lotesMap = {}
    for (const r of registros) {
      const key = r.lote_id || `fecha-${r.fecha}`
      if (!lotesMap[key]) {
        lotesMap[key] = { lote_id: key, fecha: r.fecha, nota: r.nota, items: [], total_unidades: 0 }
      }
      lotesMap[key].items.push(r)
      lotesMap[key].total_unidades += parseInt(r.cantidad)
    }
    res.json(Object.values(lotesMap))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/produccion  - cargar producción del día
router.post('/', async (req, res) => {
  const t = await sequelize.transaction()
  try {
    const { items, fecha, nota, lote_id } = req.body
    if (!items || !items.length) return res.status(400).json({ error: 'Sin items' })

    const registros = []
    for (const item of items) {
      const producto = await Producto.findByPk(item.producto_id, { transaction: t })
      if (!producto) throw new Error(`Producto ${item.producto_id} no encontrado`)

      await producto.update({ stock: producto.stock + parseInt(item.cantidad) }, { transaction: t })

      const reg = await Produccion.create({
        lote_id:     lote_id || null,
        producto_id: item.producto_id,
        cantidad:    item.cantidad,
        fecha:       fecha || new Date(),
        nota:        nota || null,
      }, { transaction: t })
      registros.push(reg)
    }

    await t.commit()
    res.status(201).json({ ok: true, registros: registros.length })
  } catch (err) {
    await t.rollback()
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/produccion/lote/:lote_id — elimina todo el lote y revierte stock
router.delete('/lote/:lote_id', async (req, res) => {
  const t = await sequelize.transaction()
  try {
    const registros = await Produccion.findAll({ where: { lote_id: req.params.lote_id }, transaction: t })
    if (!registros.length) { await t.rollback(); return res.status(404).json({ error: 'Lote no encontrado' }) }

    for (const reg of registros) {
      const producto = await Producto.findByPk(reg.producto_id, { transaction: t })
      if (producto) await producto.update({ stock: Math.max(0, producto.stock - parseInt(reg.cantidad)) }, { transaction: t })
      await reg.destroy({ transaction: t })
    }

    await t.commit()
    res.json({ ok: true, eliminados: registros.length })
  } catch (err) {
    await t.rollback()
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/produccion/:id — elimina un registro y revierte el stock
router.delete('/:id', async (req, res) => {
  const t = await sequelize.transaction()
  try {
    const registro = await Produccion.findByPk(req.params.id, { transaction: t })
    if (!registro) { await t.rollback(); return res.status(404).json({ error: 'Registro no encontrado' }) }

    const producto = await Producto.findByPk(registro.producto_id, { transaction: t })
    if (producto) {
      await producto.update({ stock: Math.max(0, producto.stock - parseInt(registro.cantidad)) }, { transaction: t })
    }

    await registro.destroy({ transaction: t })
    await t.commit()
    res.json({ ok: true })
  } catch (err) {
    await t.rollback()
    res.status(500).json({ error: err.message })
  }
})

export default router
