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
    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)
    const manana = new Date(hoy)
    manana.setDate(manana.getDate() + 1)

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

    // Ventas últimos 7 días (para gráfico)
    const hace7 = new Date()
    hace7.setDate(hace7.getDate() - 6)
    hace7.setHours(0, 0, 0, 0)

    const ventasSemana = await Venta.findAll({
      where: { fecha: { [Op.gte]: hace7 } },
      attributes: [
        [fn('DATE', col('fecha')), 'dia'],
        [fn('COUNT', col('id')), 'cantidad'],
        [fn('SUM', col('total')), 'total'],
      ],
      group: [fn('DATE', col('fecha'))],
      order: [[fn('DATE', col('fecha')), 'ASC']],
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

// GET /api/admin/movimientos?producto_id=X
router.get('/movimientos', async (req, res) => {
  try {
    const { producto_id } = req.query
    const whereP = producto_id ? { producto_id } : {}

    const entradas = await Produccion.findAll({
      where: whereP,
      include: [{ model: Producto, as: 'producto', attributes: ['id', 'codigo', 'nombre'] }],
      order: [['id', 'DESC']],
      limit: 100,
    })

    const salidas = await VentaItem.findAll({
      where: producto_id ? { producto_id } : {},
      include: [
        { model: Producto, as: 'producto', attributes: ['id', 'codigo', 'nombre'] },
        { model: Venta,    as: 'venta',    attributes: ['id', 'fecha', 'tipo'] },
      ],
      order: [['id', 'DESC']],
      limit: 100,
    })

    // Unificar y ordenar por fecha
    const movimientos = [
      ...entradas.map(e => ({
        tipo:        'entrada',
        fecha:       e.fecha,
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
