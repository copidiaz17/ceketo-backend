import { Router } from 'express'
import { Op } from 'sequelize'
import { sequelize } from '../database.js'
import Pedido from '../models/Pedido.js'
import PedidoItem from '../models/PedidoItem.js'
import Producto from '../models/Producto.js'
import Categoria from '../models/Categoria.js'
import Venta from '../models/Venta.js'
import { requireAuth } from './auth.js'

const router = Router()

// ── Encargos (postres a pedido) ──
// Categorías que se hacen a pedido: van en un pedido aparte, con fecha de entrega y seña.
// (La tienda tiene la misma lista en frontend/src/brand/marca.js.)
const CATEGORIAS_A_PEDIDO = ['PYT']          // Postres y tartas dulces
const DIAS_ANTICIPACION   = 2
const SENA_MINIMA         = 0.5              // 50 %
const TZ = 'America/Argentina/Buenos_Aires'

const hoyAR = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ })   // YYYY-MM-DD
function sumarDias(ymd, dias) {
  const d = new Date(`${ymd}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}
const esDomingo = ymd => new Date(`${ymd}T12:00:00Z`).getUTCDay() === 0

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
    const { nombre, telefono, email, direccion, localidad, metodo_pago, tipo_entrega, nota, items,
            fecha_entrega, sena_monto } = req.body
    if (!items?.length) return res.status(400).json({ error: 'Sin productos' })

    let total = 0
    let conAPedido = 0
    const itemsVal = []
    for (const item of items) {
      const prod = await Producto.findByPk(item.producto_id, {
        include: [{ model: Categoria, as: 'categoria', attributes: ['codigo'] }],
        transaction: t,
      })
      if (!prod) throw new Error(`Producto ${item.producto_id} no encontrado`)
      if (CATEGORIAS_A_PEDIDO.includes(prod.categoria?.codigo)) conAPedido++
      if (!prod.activo) throw new Error(`${prod.nombre} no está disponible`)
      const precio   = parseFloat(item.precio_unit || prod.precio)
      const subtotal = precio * parseInt(item.cantidad)
      total += subtotal
      // El stock NO se descuenta acá: el pedido queda PENDIENTE y el stock se descuenta
      // recién cuando la dueña confirma la venta en el POS (Ventas).
      itemsVal.push({ producto_id: item.producto_id, cantidad: item.cantidad, precio_unit: precio, subtotal })
    }

    // Encargo: todo el pedido son postres a pedido → fecha (2 días mínimo, sin domingos) y seña ≥ 50 %
    const esEncargo = conAPedido > 0
    if (esEncargo && conAPedido < itemsVal.length) {
      throw new Error('Los postres a pedido se encargan en un pedido aparte del resto de los productos')
    }
    let fechaEncargo = null
    let senaEncargo  = null
    if (esEncargo) {
      const minima = sumarDias(hoyAR(), DIAS_ANTICIPACION)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha_entrega || '')) throw new Error('Elegí el día de entrega del encargo')
      if (fecha_entrega < minima) throw new Error(`Los encargos se hacen con ${DIAS_ANTICIPACION} días de anticipación: el primer día posible es el ${minima.split('-').reverse().join('/')}`)
      if (esDomingo(fecha_entrega)) throw new Error('Los domingos estamos cerrados: elegí otro día de entrega')
      const sena = parseFloat(sena_monto)
      const minimaSena = Math.ceil(total * SENA_MINIMA)
      if (!(sena >= minimaSena)) throw new Error(`La seña mínima es el ${SENA_MINIMA * 100}% ($${minimaSena.toLocaleString('es-AR')})`)
      if (sena > total) throw new Error('La seña no puede superar el total del pedido')
      if (!['transferencia', 'efectivo'].includes(metodo_pago)) throw new Error('Elegí cómo pagás la seña: transferencia o efectivo en el local')
      fechaEncargo = fecha_entrega
      senaEncargo  = sena
    }

    // Nace "esperando WhatsApp": entra a Pendientes recién cuando en la caja confirman que llegó el mensaje
    const pedido = await Pedido.create(
      { nombre, telefono, email, direccion, localidad, metodo_pago, tipo_entrega, nota, total, whatsapp_recibido: false,
        fecha_entrega: fechaEncargo, sena_monto: senaEncargo },
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

// POST /api/pedidos/:id/sena  (admin/ventas) — llegó la seña de un encargo: se registra como VENTA
// por el monto de la seña (sin productos ni stock). El día de la entrega, la venta del pedido
// descuenta esta seña (ventas.sena_aplicada) y se cobra solo el saldo.
router.post('/:id/sena', requireAuth, async (req, res) => {
  const t = await sequelize.transaction()
  try {
    const pedido = await Pedido.findByPk(req.params.id, { transaction: t, lock: t.LOCK.UPDATE })
    if (!pedido) throw new Error('Pedido no encontrado')
    if (!pedido.fecha_entrega) throw new Error('Este pedido no es un encargo con seña')
    if (pedido.sena_venta_id) throw new Error('La seña de este pedido ya está registrada')
    if (pedido.estado === 'cancelado') throw new Error('El pedido está cancelado')
    const monto  = parseFloat(req.body.monto)
    const metodo = req.body.metodo
    if (!(monto > 0)) throw new Error('Monto de seña inválido')
    if (monto > parseFloat(pedido.total)) throw new Error('La seña no puede superar el total del pedido')
    if (!['transferencia', 'efectivo'].includes(metodo)) throw new Error('Método de pago inválido')

    const saldo = parseFloat(pedido.total) - monto
    const entrega = pedido.fecha_entrega.split('-').reverse().join('/')
    const venta = await Venta.create({
      tipo: 'online',
      total: monto,
      metodo_pago: metodo,
      nota: `Seña encargo #${pedido.id} — ${pedido.nombre} — entrega ${entrega} — saldo $${saldo.toLocaleString('es-AR')}`,
      fecha: new Date(),
    }, { transaction: t })
    await pedido.update({ sena_monto: monto, sena_venta_id: venta.id, whatsapp_recibido: true }, { transaction: t })
    await t.commit()
    res.status(201).json({ ok: true, venta_id: venta.id, pedido })
  } catch (err) {
    await t.rollback()
    res.status(400).json({ error: err.message })
  }
})

// PATCH /api/pedidos/:id/whatsapp  (admin/ventas) — llegó el WhatsApp del cliente: pasa a Pendientes
router.patch('/:id/whatsapp', requireAuth, async (req, res) => {
  try {
    const pedido = await Pedido.findByPk(req.params.id)
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' })
    await pedido.update({ whatsapp_recibido: true })
    res.json(pedido)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PATCH /api/pedidos/:id/estado  (admin)
router.patch('/:id/estado', requireAuth, async (req, res) => {
  try {
    const pedido = await Pedido.findByPk(req.params.id)
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' })
    const updates = {}
    if (req.body.estado   !== undefined) updates.estado   = req.body.estado
    if (req.body.venta_id !== undefined) updates.venta_id = req.body.venta_id
    await pedido.update(updates)
    res.json(pedido)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
