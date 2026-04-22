import { Router } from 'express'
import { Op } from 'sequelize'
import { sequelize } from '../database.js'
import Pedido from '../models/Pedido.js'
import PedidoItem from '../models/PedidoItem.js'
import Producto from '../models/Producto.js'
import Categoria from '../models/Categoria.js'
import { requireAuth } from './auth.js'

const router = Router()

async function notificarWhatsApp(pedido, items) {
  const instance = process.env.ULTRAMSG_INSTANCE
  const token    = process.env.ULTRAMSG_TOKEN
  const phone    = process.env.WHATSAPP_ADMIN
  if (!instance || !token || !phone) return

  const lineas = items.map(i => `• ${i.cantidad}x ${i.producto?.nombre || 'Producto'} ($${i.subtotal})`).join('\n')
  const msg = `🛒 *Nuevo pedido Ceketo*\n👤 ${pedido.nombre} | 📞 ${pedido.telefono}\n📍 ${pedido.localidad || ''}\n💳 ${pedido.metodo_pago}\n\n${lineas}\n\n💰 *Total: $${pedido.total}*`

  try {
    await fetch(`https://api.ultramsg.com/${instance}/messages/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token, to: phone, body: msg }),
    })
  } catch { /* no bloquear si falla WhatsApp */ }
}

// GET /api/pedidos?estado=X&fecha_desde=YYYY-MM-DD&fecha_hasta=YYYY-MM-DD&producto_id=X&categoria_id=X  (admin)
router.get('/', requireAuth, async (req, res) => {
  try {
    const { estado, fecha_desde, fecha_hasta, producto_id, categoria_id } = req.query

    // Filtro sobre Pedido
    const wherePedido = {}
    if (estado && estado !== 'todos') wherePedido.estado = estado
    if (fecha_desde || fecha_hasta) {
      wherePedido.fecha = {}
      if (fecha_desde) wherePedido.fecha[Op.gte] = new Date(fecha_desde)
      if (fecha_hasta) {
        const hasta = new Date(fecha_hasta)
        hasta.setDate(hasta.getDate() + 1)
        wherePedido.fecha[Op.lt] = hasta
      }
    }

    // Filtro sobre Producto (para filtrar por producto_id o categoria_id)
    const whereProducto = {}
    if (producto_id)  whereProducto.id           = producto_id
    if (categoria_id) whereProducto.categoria_id = categoria_id
    const filtrarProducto = producto_id || categoria_id

    const pedidos = await Pedido.findAll({
      where: wherePedido,
      include: [{
        model: PedidoItem,
        as: 'items',
        include: [{
          model: Producto,
          as: 'producto',
          attributes: ['id', 'codigo', 'nombre', 'categoria_id'],
          include: [{ model: Categoria, as: 'categoria', attributes: ['id', 'nombre'] }],
          ...(filtrarProducto ? { where: whereProducto, required: true } : {}),
        }],
        ...(filtrarProducto ? { required: true } : {}),
      }],
      order: [['fecha', 'DESC']],
      limit: 500,
    })
    res.json(pedidos)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/pedidos  (público - checkout)
router.post('/', async (req, res) => {
  const t = await sequelize.transaction()
  try {
    const { nombre, telefono, email, direccion, localidad, metodo_pago, nota, items } = req.body
    if (!items?.length) return res.status(400).json({ error: 'Sin productos' })

    let total = 0
    const itemsVal = []
    for (const item of items) {
      const prod = await Producto.findByPk(item.producto_id, { transaction: t })
      if (!prod) throw new Error(`Producto ${item.producto_id} no encontrado`)
      if (!prod.activo) throw new Error(`${prod.nombre} no está disponible`)
      if (prod.stock < parseInt(item.cantidad)) throw new Error(`Stock insuficiente para ${prod.nombre}`)
      const precio   = parseFloat(item.precio_unit || prod.precio)
      const subtotal = precio * parseInt(item.cantidad)
      total += subtotal
      await prod.update({ stock: prod.stock - parseInt(item.cantidad) }, { transaction: t })
      itemsVal.push({ producto_id: item.producto_id, cantidad: item.cantidad, precio_unit: precio, subtotal })
    }

    const pedido = await Pedido.create(
      { nombre, telefono, email, direccion, localidad, metodo_pago, nota, total },
      { transaction: t }
    )
    await PedidoItem.bulkCreate(
      itemsVal.map(i => ({ ...i, pedido_id: pedido.id })),
      { transaction: t }
    )

    await t.commit()
    const itemsConProd = itemsVal.map((i, idx) => ({ ...i, producto: { nombre: items[idx]?.nombre || '' } }))
    notificarWhatsApp(pedido, itemsConProd)
    res.status(201).json({ ok: true, pedido_id: pedido.id, total })
  } catch (err) {
    await t.rollback()
    res.status(400).json({ error: err.message })
  }
})

// PATCH /api/pedidos/:id/estado  (admin)
router.patch('/:id/estado', requireAuth, async (req, res) => {
  try {
    const pedido = await Pedido.findByPk(req.params.id)
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' })
    await pedido.update({ estado: req.body.estado })
    res.json(pedido)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
