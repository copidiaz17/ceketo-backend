import { Router } from 'express'
import { sequelize } from '../database.js'
import Venta from '../models/Venta.js'
import VentaItem from '../models/VentaItem.js'
import Producto from '../models/Producto.js'
import Categoria from '../models/Categoria.js'
import MovimientoCuenta from '../models/MovimientoCuenta.js'
import CuentaCorriente from '../models/CuentaCorriente.js'
import { requireAuth } from './auth.js'

const router = Router()
router.use(requireAuth)

// GET /api/ventas - historial
router.get('/', async (req, res) => {
  try {
    const ventas = await Venta.findAll({
      include: [{
        model: VentaItem,
        as: 'items',
        include: [{
          model: Producto,
          as: 'producto',
          attributes: ['id', 'codigo', 'nombre'],
          include: [{ model: Categoria, as: 'categoria', attributes: ['nombre'] }],
        }],
      }],
      order: [['fecha', 'DESC']],
      limit: 100,
    })
    res.json(ventas)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/ventas - registrar venta
router.post('/', async (req, res) => {
  const t = await sequelize.transaction()
  try {
    const { items, tipo = 'local', nota, metodo_pago, descuento = 0, fecha, cuenta_id } = req.body
    // items = [{ producto_id, cantidad, precio_unit }]
    if (!items || !items.length) return res.status(400).json({ error: 'Sin items' })

    let total = 0
    const itemsValidados = []

    for (const item of items) {
      const producto = await Producto.findByPk(item.producto_id, { transaction: t })
      if (!producto) throw new Error(`Producto ${item.producto_id} no encontrado`)
      if (producto.stock < item.cantidad) throw new Error(`Stock insuficiente para ${producto.nombre}`)

      const precio = parseFloat(item.precio_unit || producto.precio)
      const subtotal = precio * parseInt(item.cantidad)
      total += subtotal

      await producto.update({ stock: producto.stock - parseInt(item.cantidad) }, { transaction: t })
      itemsValidados.push({ producto_id: item.producto_id, cantidad: item.cantidad, precio_unit: precio, subtotal })
    }

    const pct = Math.min(Math.max(parseFloat(descuento) || 0, 0), 100)
    const totalFinal = parseFloat((total - (total * pct / 100)).toFixed(2))
    const fechaVenta = fecha
      ? new Date(`${fecha}T12:00:00-03:00`)
      : new Date()
    const venta = await Venta.create({ tipo, total: totalFinal, nota: nota || null, metodo_pago: metodo_pago || null, descuento: pct, fecha: fechaVenta }, { transaction: t })
    await VentaItem.bulkCreate(
      itemsValidados.map(i => ({ ...i, venta_id: venta.id })),
      { transaction: t }
    )

    // Si la venta es a cuenta corriente, registrar el movimiento en la cuenta del cliente
    if (metodo_pago === 'cuenta_corriente' && cuenta_id) {
      const cuenta = await CuentaCorriente.findByPk(cuenta_id, { transaction: t })
      if (cuenta && cuenta.tipo === 'cliente') {
        const conceptoItems = itemsValidados.length === 1
          ? `Venta #${venta.id}`
          : `Venta #${venta.id} (${itemsValidados.length} productos)`
        await MovimientoCuenta.create({
          cuenta_id,
          fecha:    venta.fecha,
          tipo:     'cargo',
          concepto: nota || conceptoItems,
          monto:    totalFinal,
          venta_id: venta.id,
        }, { transaction: t })
      }
    }

    await t.commit()
    res.status(201).json({ ok: true, venta_id: venta.id, total: totalFinal })
  } catch (err) {
    await t.rollback()
    res.status(400).json({ error: err.message })
  }
})

// DELETE /api/ventas/:id  — anula la venta y repone stock
router.delete('/:id', async (req, res) => {
  const t = await sequelize.transaction()
  try {
    const venta = await Venta.findByPk(req.params.id, {
      include: [{ model: VentaItem, as: 'items' }],
    })
    if (!venta) { await t.rollback(); return res.status(404).json({ error: 'Venta no encontrada' }) }

    for (const item of venta.items) {
      const producto = await Producto.findByPk(item.producto_id, { transaction: t })
      if (producto) await producto.update({ stock: producto.stock + parseInt(item.cantidad) }, { transaction: t })
    }

    await VentaItem.destroy({ where: { venta_id: venta.id }, transaction: t })
    await venta.destroy({ transaction: t })
    await t.commit()
    res.json({ ok: true })
  } catch (err) {
    await t.rollback()
    res.status(500).json({ error: err.message })
  }
})

// GET /api/ventas/:id
router.get('/:id', async (req, res) => {
  try {
    const venta = await Venta.findByPk(req.params.id, {
      include: [{
        model: VentaItem,
        as: 'items',
        include: [{ model: Producto, as: 'producto', attributes: ['id', 'codigo', 'nombre'] }],
      }],
    })
    if (!venta) return res.status(404).json({ error: 'Venta no encontrada' })
    res.json(venta)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
