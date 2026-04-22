import { Router } from 'express'
import { Op, fn, col, literal } from 'sequelize'
import { sequelize } from '../database.js'
import Venta from '../models/Venta.js'
import VentaItem from '../models/VentaItem.js'
import Produccion from '../models/Produccion.js'
import Producto from '../models/Producto.js'
import Categoria from '../models/Categoria.js'
import Pedido from '../models/Pedido.js'
import { requireAuth } from './auth.js'

const router = Router()
router.use(requireAuth)

// GET /api/admin/dashboard
router.get('/dashboard', async (req, res) => {
  try {
    // Argentina = UTC-3. Calculamos el "hoy" en zona Argentina.
    const nowUTC = new Date()
    const ARG_OFFSET_MS = 3 * 60 * 60 * 1000
    // Fecha de hoy en Argentina (string YYYY-MM-DD)
    const argTodayStr = new Date(nowUTC.getTime() - ARG_OFFSET_MS).toISOString().slice(0, 10)
    // Medianoche Argentina en UTC = argTodayStr T03:00:00 UTC
    const hoy    = new Date(argTodayStr + 'T03:00:00.000Z')
    const manana = new Date(hoy.getTime() + 24 * 60 * 60 * 1000)

    // Ventas de hoy
    const ventasHoy = await Venta.findAll({
      where: { fecha: { [Op.gte]: hoy, [Op.lt]: manana } },
      include: [{ model: VentaItem, as: 'items' }],
    })
    const totalHoy     = ventasHoy.reduce((a, v) => a + parseFloat(v.total), 0)
    const cantidadHoy  = ventasHoy.length

    // Pedidos online pendientes
    const pedidosPendientes = await Pedido.count({ where: { estado: 'pendiente' } })

    // Productos con stock bajo (< 5)
    const stockBajo = await Producto.findAll({
      where: { stock: { [Op.lt]: 5 }, activo: true },
      include: [{ model: Categoria, as: 'categoria', attributes: ['nombre'] }],
      attributes: ['id', 'codigo', 'nombre', 'stock'],
      order: [['stock', 'ASC']],
      limit: 10,
    })

    // Ventas últimos 7 días (para gráfico) — agrupamos por fecha Argentina (UTC-3)
    const hace7Str = new Date(nowUTC.getTime() - ARG_OFFSET_MS - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const hace7    = new Date(hace7Str + 'T03:00:00.000Z')

    const ventasSemana = await Venta.findAll({
      where: { fecha: { [Op.gte]: hace7 } },
      attributes: [
        [fn('DATE', fn('CONVERT_TZ', col('fecha'), '+00:00', '-03:00')), 'dia'],
        [fn('COUNT', col('id')), 'cantidad'],
        [fn('SUM', col('total')), 'total'],
      ],
      group: [fn('DATE', fn('CONVERT_TZ', col('fecha'), '+00:00', '-03:00'))],
      order: [[fn('DATE', fn('CONVERT_TZ', col('fecha'), '+00:00', '-03:00')), 'ASC']],
      raw: true,
    })

    // Últimas 5 ventas
    const ultimasVentas = await Venta.findAll({
      include: [{ model: VentaItem, as: 'items', include: [{ model: Producto, as: 'producto', attributes: ['nombre'] }] }],
      order: [['fecha', 'DESC']],
      limit: 5,
    })

    // Top 5 productos más vendidos (histórico)
    const topProductos = await VentaItem.findAll({
      attributes: ['producto_id', [fn('SUM', col('cantidad')), 'total_vendido']],
      include: [{ model: Producto, as: 'producto', attributes: ['nombre', 'codigo'] }],
      group: ['producto_id', 'producto.id', 'producto.nombre', 'producto.codigo'],
      order: [[fn('SUM', col('cantidad')), 'DESC']],
      limit: 5,
      raw: false,
    })

    res.json({
      hoy: { total: totalHoy, cantidad: cantidadHoy },
      pedidosPendientes,
      stockBajo,
      ventasSemana,
      ultimasVentas,
      topProductos: topProductos.map(t => ({
        nombre: t.producto?.nombre,
        codigo: t.producto?.codigo,
        total_vendido: parseInt(t.dataValues.total_vendido),
      })),
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/admin/stock-bajo/count
router.get('/stock-bajo/count', async (req, res) => {
  try {
    const count = await Producto.count({ where: { stock: { [Op.lt]: 5 }, activo: true } })
    res.json({ count })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/admin/movimientos?producto_id=X&categoria_id=Y&fecha_desde=YYYY-MM-DD&fecha_hasta=YYYY-MM-DD
router.get('/movimientos', async (req, res) => {
  try {
    const { producto_id, categoria_id, fecha_desde, fecha_hasta } = req.query
    const whereP = producto_id ? { producto_id } : {}
    const whereProducto = categoria_id ? { categoria_id } : {}
    const includeProducto = {
      model: Producto,
      as: 'producto',
      attributes: ['id', 'codigo', 'nombre', 'categoria_id'],
      include: [{ model: Categoria, as: 'categoria', attributes: ['id', 'nombre'] }],
      ...(categoria_id ? { where: whereProducto, required: true } : {}),
    }

    // Rango de fechas para producciones (campo fecha DATEONLY)
    const whereProduccion = { ...whereP }
    if (fecha_desde) whereProduccion.fecha = { ...whereProduccion.fecha, [Op.gte]: fecha_desde }
    if (fecha_hasta) whereProduccion.fecha = { ...whereProduccion.fecha, [Op.lte]: fecha_hasta }

    const entradas = await Produccion.findAll({
      where: whereProduccion,
      include: [includeProducto],
      order: [['id', 'DESC']],
      limit: 500,
    })

    // Rango de fechas para ventas (campo fecha DATETIME en Venta)
    const whereVenta = {}
    if (fecha_desde) whereVenta.fecha = { ...whereVenta.fecha, [Op.gte]: new Date(fecha_desde) }
    if (fecha_hasta) {
      const hasta = new Date(fecha_hasta)
      hasta.setDate(hasta.getDate() + 1)
      whereVenta.fecha = { ...whereVenta.fecha, [Op.lt]: hasta }
    }

    const salidas = await VentaItem.findAll({
      where: producto_id ? { producto_id } : {},
      include: [
        includeProducto,
        { model: Venta, as: 'venta', attributes: ['id', 'fecha', 'tipo'], ...(Object.keys(whereVenta).length ? { where: whereVenta, required: true } : {}) },
      ],
      order: [['id', 'DESC']],
      limit: 500,
    })

    // Unificar y ordenar por fecha
    const movimientos = [
      ...entradas.map(e => ({
        tipo:        'entrada',
        fecha:       e.fecha,   // DATEONLY: "YYYY-MM-DD"
        solo_fecha:  true,      // no tiene hora, el cliente lo formatea solo como fecha
        cantidad:    e.cantidad,
        producto:    e.producto,
        referencia:  `Producción`,
        nota:        e.nota,
      })),
      ...salidas.map(s => ({
        tipo:        'salida',
        fecha:       s.venta?.fecha,
        cantidad:    s.cantidad,
        producto:    s.producto,
        referencia:  `Venta #${s.venta?.id} (${s.venta?.tipo})`,
        nota:        null,
      })),
    ].sort((a, b) => new Date(b.fecha) - new Date(a.fecha))

    res.json(movimientos)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
