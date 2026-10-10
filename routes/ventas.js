import { Router } from 'express'
import { sequelize } from '../database.js'
import Venta from '../models/Venta.js'
import VentaItem from '../models/VentaItem.js'
import Producto from '../models/Producto.js'
import Categoria from '../models/Categoria.js'
import MovimientoCuenta from '../models/MovimientoCuenta.js'
import CuentaCorriente from '../models/CuentaCorriente.js'
import Pedido from '../models/Pedido.js'
import { requireAuth } from './auth.js'

const router = Router()
router.use(requireAuth)

// GET /api/ventas - historial
router.get('/', async (req, res) => {
  try {
    const { fecha } = req.query
    const whereClause = fecha
      ? sequelize.where(
          sequelize.fn('DATE', sequelize.fn('CONVERT_TZ', sequelize.col('fecha'), '+00:00', '-03:00')),
          fecha
        )
      : {}

    const ventas = await Venta.findAll({
      where: whereClause,
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
      order: [['fecha', 'DESC'], ['id', 'DESC']],
      limit: fecha ? undefined : 100,
    })
    res.json(ventas)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Pago dividido y cuenta corriente ────────────────────────────────────────
// Una venta se puede pagar con 1 o 2 medios (cualquiera, incluida la cuenta corriente).
// Lo que se paga "a cuenta" se carga en la cuenta del cliente: solo esa parte, no el total.
const METODOS_VENTA = ['efectivo', 'transferencia', 'debito', 'credito', 'qr', 'cuenta_corriente']

function validarPagos(metodo1, metodo2, monto2, total) {
  if (metodo1 && !METODOS_VENTA.includes(metodo1)) throw new Error('Método de pago inválido')
  if (!metodo2) return
  if (!METODOS_VENTA.includes(metodo2)) throw new Error('Segundo método de pago inválido')
  if (metodo2 === metodo1) throw new Error('Los dos medios de pago tienen que ser distintos')
  const m2 = parseFloat(monto2)
  if (!(m2 > 0) || m2 >= total) throw new Error(`El monto del segundo medio tiene que ser mayor a 0 y menor al total ($${total})`)
}

// Parte de la venta que queda en cuenta corriente
function montoACuenta(venta) {
  const total = parseFloat(venta.total) || 0
  const m2 = venta.metodo_pago2 ? (parseFloat(venta.monto_pago2) || 0) : 0
  if (venta.metodo_pago === 'cuenta_corriente') return Math.round((total - m2) * 100) / 100
  if (venta.metodo_pago2 === 'cuenta_corriente') return m2
  return 0
}

// Crea, actualiza o borra el cargo en la cuenta del cliente según cómo quedó pagada la venta
async function sincronizarCargo(venta, cuenta_id, concepto, t) {
  const monto = montoACuenta(venta)
  const existente = await MovimientoCuenta.findOne({ where: { venta_id: venta.id }, transaction: t })
  if (monto <= 0) {
    if (existente) await existente.destroy({ transaction: t })
    return
  }
  const cuentaId = cuenta_id || existente?.cuenta_id
  if (!cuentaId) throw new Error('Elegí el cliente de la cuenta corriente')
  const cuenta = await CuentaCorriente.findByPk(cuentaId, { transaction: t })
  if (!cuenta || cuenta.tipo !== 'cliente') throw new Error('La cuenta corriente elegida no es de un cliente')
  const total = parseFloat(venta.total) || 0
  const texto = monto < total ? `${concepto} — a cuenta $${monto.toLocaleString('es-AR')} de $${total.toLocaleString('es-AR')}` : concepto
  if (existente) await existente.update({ cuenta_id: cuentaId, monto, concepto: texto }, { transaction: t })
  else await MovimientoCuenta.create({ cuenta_id: cuentaId, fecha: venta.fecha, tipo: 'cargo', concepto: texto, monto, venta_id: venta.id }, { transaction: t })
}

// POST /api/ventas - registrar venta
router.post('/', async (req, res) => {
  const t = await sequelize.transaction()
  try {
    const { items, tipo = 'local', nota, metodo_pago, metodo_pago2, monto_pago2, descuento = 0, fecha, cuenta_id, costo_envio = 0, sena_aplicada = 0 } = req.body
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
    const envio = Math.max(parseFloat(costo_envio) || 0, 0)
    // Encargos: la seña ya se cobró en otra venta → acá se cobra solo el saldo
    const sena = Math.max(parseFloat(sena_aplicada) || 0, 0)
    const bruto = total - (total * pct / 100) + envio
    if (sena > bruto + 0.01) throw new Error('La seña no puede ser mayor que el total de la venta')
    const totalFinal = parseFloat((bruto - sena).toFixed(2))
    const fechaVenta = fecha
      ? new Date(`${fecha}T12:00:00-03:00`)
      : new Date()
    validarPagos(metodo_pago, metodo_pago2, monto_pago2, totalFinal)
    const montoPago2 = metodo_pago2 && monto_pago2 ? parseFloat(monto_pago2) : null
    const venta = await Venta.create({
      tipo, total: totalFinal, nota: nota || null,
      metodo_pago: metodo_pago || null,
      metodo_pago2: metodo_pago2 || null,
      monto_pago2: montoPago2,
      descuento: pct, costo_envio: envio, fecha: fechaVenta, sena_aplicada: sena,
    }, { transaction: t })
    await VentaItem.bulkCreate(
      itemsValidados.map(i => ({ ...i, venta_id: venta.id })),
      { transaction: t }
    )

    // Lo que se paga a cuenta corriente (todo o una parte) se carga en la cuenta del cliente
    const conceptoItems = itemsValidados.length === 1
      ? `Venta #${venta.id}`
      : `Venta #${venta.id} (${itemsValidados.length} productos)`
    await sincronizarCargo(venta, cuenta_id, nota || conceptoItems, t)

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

    // Si tenía una parte a cuenta corriente, el cargo en la cuenta del cliente se borra (antes quedaba la deuda)
    await MovimientoCuenta.destroy({ where: { venta_id: venta.id }, transaction: t })
    // Si era la venta de la seña de un encargo, el encargo vuelve a quedar con la seña sin registrar
    await Pedido.update({ sena_venta_id: null }, { where: { sena_venta_id: venta.id }, transaction: t })
    await VentaItem.destroy({ where: { venta_id: venta.id }, transaction: t })
    await venta.destroy({ transaction: t })
    await t.commit()
    res.json({ ok: true })
  } catch (err) {
    await t.rollback()
    res.status(500).json({ error: err.message })
  }
})

// PATCH /api/ventas/:id — editar forma de pago
router.patch('/:id', async (req, res) => {
  const t = await sequelize.transaction()
  try {
    const venta = await Venta.findByPk(req.params.id, { transaction: t, lock: t.LOCK.UPDATE })
    if (!venta) { await t.rollback(); return res.status(404).json({ error: 'Venta no encontrada' }) }
    const { metodo_pago, metodo_pago2, monto_pago2, cuenta_id } = req.body
    const m1 = metodo_pago || venta.metodo_pago
    validarPagos(m1, metodo_pago2 || null, monto_pago2, parseFloat(venta.total))
    await venta.update({
      metodo_pago:  m1,
      metodo_pago2: metodo_pago2 || null,
      monto_pago2:  metodo_pago2 && monto_pago2 ? parseFloat(monto_pago2) : null,
    }, { transaction: t })
    // Si cambió lo que va a cuenta corriente, el cargo del cliente se ajusta (o se crea / se borra)
    await sincronizarCargo(venta, cuenta_id, venta.nota || `Venta #${venta.id}`, t)
    await t.commit()
    res.json({ ok: true, venta })
  } catch (err) {
    await t.rollback()
    res.status(400).json({ error: err.message })
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
