import { Router } from 'express'
import { Op, fn, col, literal } from 'sequelize'
import Venta      from '../models/Venta.js'
import VentaItem  from '../models/VentaItem.js'
import Pedido     from '../models/Pedido.js'
import PedidoItem from '../models/PedidoItem.js'
import Producto   from '../models/Producto.js'
import Categoria  from '../models/Categoria.js'
import Gasto      from '../models/Gasto.js'
import Produccion from '../models/Produccion.js'
import Caja            from '../models/Caja.js'
import MovimientoCaja  from '../models/MovimientoCaja.js'
import { requireAuth } from './auth.js'

const router = Router()
router.use(requireAuth)

// ── Helpers ───────────────────────────────────────────────────────────────────
// Op.gte / Op.lte son Symbols → Object.keys() no los ve.
// Se chequean los parámetros de entrada, no las claves del objeto.

function buildRangoUTC(fecha_desde, fecha_hasta) {
  if (!fecha_desde && !fecha_hasta) return null
  const r = {}
  if (fecha_desde) r[Op.gte] = new Date(fecha_desde + 'T00:00:00-03:00')
  if (fecha_hasta) r[Op.lte] = new Date(fecha_hasta + 'T23:59:59.999-03:00')
  return r
}

function buildRangoDate(fecha_desde, fecha_hasta) {
  if (!fecha_desde && !fecha_hasta) return null
  const r = {}
  if (fecha_desde) r[Op.gte] = fecha_desde
  if (fecha_hasta) r[Op.lte] = fecha_hasta
  return r
}

// ── GET /api/admin/reportes ───────────────────────────────────────────────────
// Ventas (POS + pedidos online) con filtros de fecha, categoría y producto
router.get('/', async (req, res) => {
  try {
    const { fecha_desde, fecha_hasta, categoria_id, producto_id } = req.query

    const rangoFecha = buildRangoUTC(fecha_desde, fecha_hasta)
    const filtrarProd = !!(producto_id || categoria_id)

    const inclProd = {
      model: Producto, as: 'producto',
      attributes: ['id', 'codigo', 'nombre', 'categoria_id'],
      include: [{ model: Categoria, as: 'categoria', attributes: ['id', 'nombre'] }],
    }

    const ventas = await Venta.findAll({
      where: rangoFecha ? { fecha: rangoFecha } : {},
      include: [{ model: VentaItem, as: 'items', include: [inclProd] }],
      order: [['fecha', 'DESC']],
      limit: 2000,
    })

    const pedidos = await Pedido.findAll({
      where: {
        ...(rangoFecha ? { fecha: rangoFecha } : {}),
        venta_id: null,                    // ← ya facturados como venta: se cuentan como venta (evita el duplicado)
        estado: { [Op.ne]: 'cancelado' },  // los rechazados no son ventas
      },
      include: [{ model: PedidoItem, as: 'items', include: [{ ...inclProd }] }],
      order: [['fecha', 'DESC']],
      limit: 2000,
    })

    function filtrarItems(items) {
      return (items || []).filter(i => {
        if (producto_id  && String(i.producto?.id)           !== String(producto_id))  return false
        if (categoria_id && String(i.producto?.categoria_id) !== String(categoria_id)) return false
        return true
      })
    }

    const mapItem = (i, descuentoPct = 0) => {
      const subtotalOriginal = parseFloat(i.subtotal || 0)
      return {
        producto_id:       i.producto?.id,
        categoria_id:      i.producto?.categoria_id,
        categoria:         i.producto?.categoria?.nombre || '—',
        producto:          i.producto?.nombre  || '—',
        codigo:            i.producto?.codigo  || '—',
        cantidad:          i.cantidad,
        precio_unit:       parseFloat(i.precio_unit || 0),
        subtotal_original: subtotalOriginal,
        subtotal:          parseFloat((subtotalOriginal * (1 - descuentoPct / 100)).toFixed(2)),
        descuento_pct:     descuentoPct,
      }
    }

    const operaciones = []
    const ventasPorMetodo = {}

    for (const v of ventas) {
      const descuentoPct   = parseFloat(v.descuento || 0)
      const itemsFiltrados = filtrarProd ? filtrarItems(v.items) : (v.items || [])
      if (filtrarProd && itemsFiltrados.length === 0) continue
      const mappedItems = itemsFiltrados.map(i => mapItem(i, descuentoPct))
      const totalOp = filtrarProd
        ? mappedItems.reduce((s, i) => s + i.subtotal, 0)
        : parseFloat(v.total)
      operaciones.push({
        id: `V-${v.id}`, fecha: v.fecha, origen: v.tipo === 'online' ? 'Online' : 'Local',
        cliente: '—', metodo_pago: v.metodo_pago || '—', entrega: 'Retiro',
        metodo_pago2: v.metodo_pago2 || null, monto_pago2: v.monto_pago2 != null ? parseFloat(v.monto_pago2) : null,
        total: totalOp, descuento: descuentoPct,
        costo_envio: parseFloat(v.costo_envio || 0),
        nota: v.nota || '', items: mappedItems,
      })
      // Acumular por método de pago (soporta pago dividido en 2 métodos)
      const monto2 = (!filtrarProd && v.metodo_pago2 && v.monto_pago2) ? parseFloat(v.monto_pago2) : 0
      const monto1 = totalOp - monto2
      const mp1 = v.metodo_pago || 'sin_metodo'
      ventasPorMetodo[mp1] = (ventasPorMetodo[mp1] || 0) + monto1
      if (monto2 > 0) {
        ventasPorMetodo[v.metodo_pago2] = (ventasPorMetodo[v.metodo_pago2] || 0) + monto2
      }
    }

    for (const p of pedidos) {
      const itemsFiltrados = filtrarProd ? filtrarItems(p.items) : (p.items || [])
      if (filtrarProd && itemsFiltrados.length === 0) continue
      const mappedItems = itemsFiltrados.map(i => mapItem(i, 0))
      const totalOp = filtrarProd
        ? mappedItems.reduce((s, i) => s + i.subtotal, 0)
        : parseFloat(p.total)
      operaciones.push({
        id: `P-${p.id}`, fecha: p.fecha, origen: 'Online',
        cliente: p.nombre || '—', telefono: p.telefono || '',
        metodo_pago: p.metodo_pago || '—',
        entrega: p.direccion ? 'Delivery' : 'Retiro',
        total: totalOp, descuento: 0, costo_envio: 0,
        nota: '', items: mappedItems,
      })
      const mp = p.metodo_pago || 'sin_metodo'
      ventasPorMetodo[mp] = (ventasPorMetodo[mp] || 0) + parseFloat(p.total)
    }

    operaciones.sort((a, b) => new Date(b.fecha) - new Date(a.fecha))

    const detalle = []
    for (const op of operaciones) {
      for (const item of op.items) {
        detalle.push({ operacion_id: op.id, fecha: op.fecha, origen: op.origen, cliente: op.cliente, nota: op.nota, ...item })
      }
    }

    const resumenMap = {}
    let totalGlobal = 0
    for (const d of detalle) {
      const key = d.codigo !== '—' ? d.codigo : d.producto
      if (!resumenMap[key]) resumenMap[key] = { categoria: d.categoria, producto: d.producto, codigo: d.codigo, cantidad: 0, total: 0, precio_unit: d.precio_unit }
      resumenMap[key].cantidad += d.cantidad
      resumenMap[key].total    += d.subtotal
      totalGlobal              += d.subtotal
    }
    const resumen = Object.values(resumenMap)
      .sort((a, b) => b.total - a.total)
      .map(r => ({ ...r, pct: totalGlobal > 0 ? parseFloat((r.total / totalGlobal * 100).toFixed(1)) : 0 }))

    const catMap = {}
    for (const d of detalle) catMap[d.categoria] = (catMap[d.categoria] || 0) + d.subtotal
    const por_categoria = Object.entries(catMap)
      .map(([cat, total]) => ({ categoria: cat, total, pct: totalGlobal > 0 ? parseFloat((total / totalGlobal * 100).toFixed(1)) : 0 }))
      .sort((a, b) => b.total - a.total)

    const diaMap = {}
    for (const op of operaciones) {
      const dia = new Date(op.fecha).toLocaleString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' }).slice(0, 10)
      diaMap[dia] = (diaMap[dia] || 0) + op.total
    }
    const por_dia = Object.entries(diaMap)
      .map(([dia, total]) => ({ dia, total }))
      .sort((a, b) => a.dia.localeCompare(b.dia))

    const totalEnvios = operaciones.reduce((s, op) => s + (op.costo_envio || 0), 0)

    const kpis = {
      total:            totalGlobal,
      total_con_envios: operaciones.reduce((s, op) => s + op.total, 0),
      total_envios:     totalEnvios,
      n_operaciones:    operaciones.length,
      ticket_promedio:  operaciones.length > 0 ? Math.round(totalGlobal / operaciones.length) : 0,
      unidades:         detalle.reduce((s, d) => s + d.cantidad, 0),
    }

    res.json({ kpis, operaciones, detalle, resumen, por_categoria, por_dia, ventasPorMetodo })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/admin/reportes/extras ────────────────────────────────────────────
// Gastos, Producción, Stock y Cajas para el mismo período
// Cada sección es independiente: si una falla no bloquea a las demás
router.get('/extras', async (req, res) => {
  try {
    const { fecha_desde, fecha_hasta } = req.query

    const rangoDate = buildRangoDate(fecha_desde, fecha_hasta)
    const rangoUTC  = buildRangoUTC(fecha_desde, fecha_hasta)
    const whereDate = rangoDate ? { fecha: rangoDate } : {}
    const whereUTC  = rangoUTC  ? { fecha_apertura: rangoUTC } : {}

    // Ejecutar las 4 queries en paralelo, de forma independiente
    const [gastosR, produccionR, stockR, cajasR] = await Promise.allSettled([

      // ── Gastos ──────────────────────────────────────────────────
      Gasto.findAll({ where: whereDate, order: [['fecha', 'DESC']] }),

      // ── Producción ──────────────────────────────────────────────
      Produccion.findAll({
        where: whereDate,
        include: [{
          model: Producto, as: 'producto',
          attributes: ['id', 'codigo', 'nombre'],
          include: [{ model: Categoria, as: 'categoria', attributes: ['nombre'] }],
        }],
        order: [['fecha', 'DESC'], ['id', 'DESC']],
        limit: 1000,
      }),

      // ── Stock actual ─────────────────────────────────────────────
      Producto.findAll({
        where: { activo: true },
        attributes: ['id', 'codigo', 'nombre', 'precio', 'stock', 'precio_costo'],
        include: [{ model: Categoria, as: 'categoria', attributes: ['nombre'] }],
        order: [['nombre', 'ASC']],
      }),

      // ── Cajas del período ────────────────────────────────────────
      Caja.findAll({
        where: Object.keys(whereUTC).length ? whereUTC : {},
        order: [['fecha_apertura', 'DESC']],
        limit: 60,
      }),
    ])

    // Loguear errores sin abortar la respuesta
    if (gastosR.status    === 'rejected') console.error('extras/gastos:', gastosR.reason?.message)
    if (produccionR.status === 'rejected') console.error('extras/produccion:', produccionR.reason?.message)
    if (stockR.status     === 'rejected') console.error('extras/stock:', stockR.reason?.message)
    if (cajasR.status     === 'rejected') console.error('extras/cajas:', cajasR.reason?.message)

    const gastos    = gastosR.status    === 'fulfilled' ? gastosR.value    : []
    const produccion = produccionR.status === 'fulfilled' ? produccionR.value : []
    const stock     = stockR.status     === 'fulfilled' ? stockR.value     : []
    const cajas     = cajasR.status     === 'fulfilled' ? cajasR.value     : []

    // ── Calcular resúmenes de gastos ──────────────────────────────
    const gastosPorCategoria = {}
    let totalGastos = 0, ivaTotal = 0
    for (const g of gastos) {
      const cat = g.categoria || 'Otros'
      if (!gastosPorCategoria[cat]) gastosPorCategoria[cat] = { total: 0, cantidad: 0, iva: 0 }
      gastosPorCategoria[cat].total    += Number(g.monto)
      gastosPorCategoria[cat].cantidad += 1
      gastosPorCategoria[cat].iva      += Number(g.iva_monto || 0)
      totalGastos += Number(g.monto)
      ivaTotal    += Number(g.iva_monto || 0)
    }

    const gastosPorDia = {}
    for (const g of gastos) {
      const dia = String(g.fecha)
      gastosPorDia[dia] = (gastosPorDia[dia] || 0) + Number(g.monto)
    }
    const gastosPorDiaArr = Object.entries(gastosPorDia)
      .map(([dia, total]) => ({ dia, total }))
      .sort((a, b) => a.dia.localeCompare(b.dia))

    // ── Calcular resúmenes de producción ──────────────────────────
    const lotesMap = {}
    let totalUnidadesProducidas = 0
    const produccionPorProducto = {}
    for (const r of produccion) {
      const key = r.lote_id || `fecha-${r.fecha}`
      if (!lotesMap[key]) lotesMap[key] = { lote_id: key, fecha: r.fecha, nota: r.nota, items: [], total_unidades: 0 }
      lotesMap[key].items.push({ producto: r.producto?.nombre, categoria: r.producto?.categoria?.nombre, codigo: r.producto?.codigo, cantidad: Number(r.cantidad) })
      lotesMap[key].total_unidades += Number(r.cantidad)
      totalUnidadesProducidas      += Number(r.cantidad)
      const pk = r.producto?.nombre || String(r.producto_id)
      if (!produccionPorProducto[pk]) produccionPorProducto[pk] = { producto: r.producto?.nombre, categoria: r.producto?.categoria?.nombre, codigo: r.producto?.codigo, cantidad: 0 }
      produccionPorProducto[pk].cantidad += Number(r.cantidad)
    }

    // ── Calcular valorización de stock ────────────────────────────
    let stockValorCosto = 0, stockValorVenta = 0
    for (const p of stock) {
      const cant = Number(p.stock || 0)
      stockValorCosto += cant * Number(p.precio_costo || 0)
      stockValorVenta += cant * Number(p.precio      || 0)
    }

    // ── Movimientos manuales de cajas del período ─────────────────
    let movimientosManuales = []
    const cajaIds = cajas.map(c => c.id)
    if (cajaIds.length > 0) {
      try {
        movimientosManuales = await MovimientoCaja.findAll({
          where: { caja_id: { [Op.in]: cajaIds } },
          order: [['createdAt', 'ASC']],
        })
      } catch (e) { console.error('extras/movimientos:', e.message) }
    }

    const EFECTIVO   = m => !m.medio || m.medio === 'efectivo'
    const BILLETERA  = m => m.medio === 'billetera'
    const resumenMovimientos = {
      ingresos_efectivo:  movimientosManuales.filter(m => m.tipo === 'ingreso' && EFECTIVO(m)).reduce((s, m) => s + Number(m.monto), 0),
      egresos_efectivo:   movimientosManuales.filter(m => m.tipo === 'egreso'  && EFECTIVO(m)).reduce((s, m) => s + Number(m.monto), 0),
      ingresos_billetera: movimientosManuales.filter(m => m.tipo === 'ingreso' && BILLETERA(m)).reduce((s, m) => s + Number(m.monto), 0),
      egresos_billetera:  movimientosManuales.filter(m => m.tipo === 'egreso'  && BILLETERA(m)).reduce((s, m) => s + Number(m.monto), 0),
      detalle: movimientosManuales.map(m => ({
        id: m.id, caja_id: m.caja_id, tipo: m.tipo, concepto: m.concepto,
        monto: Number(m.monto), medio: m.medio || 'efectivo', fecha: m.createdAt,
      })),
    }

    // Gastos por medio (efectivo vs digital)
    const METODOS_DIGITALES = ['transferencia', 'qr', 'debito', 'credito']
    const gastosPorMedio = {
      efectivo: gastos.filter(g => !g.metodo_pago || g.metodo_pago === 'efectivo').reduce((s, g) => s + Number(g.monto), 0),
      digital:  gastos.filter(g => METODOS_DIGITALES.includes(g.metodo_pago)).reduce((s, g) => s + Number(g.monto), 0),
      sin_metodo: gastos.filter(g => !g.metodo_pago).reduce((s, g) => s + Number(g.monto), 0),
    }

    res.json({
      gastos,
      gastosPorCategoria,
      gastosPorMedio,
      gastosPorDia: gastosPorDiaArr,
      totalGastos,
      ivaTotal,
      lotes: Object.values(lotesMap),
      produccionPorProducto: Object.values(produccionPorProducto).sort((a, b) => b.cantidad - a.cantidad),
      totalUnidadesProducidas,
      stock,
      stockValorCosto,
      stockValorVenta,
      cajas,
      resumenMovimientos,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

export default router
