import { Router } from 'express'
import { Op } from 'sequelize'
import Venta     from '../models/Venta.js'
import VentaItem from '../models/VentaItem.js'
import Pedido    from '../models/Pedido.js'
import PedidoItem from '../models/PedidoItem.js'
import Producto  from '../models/Producto.js'
import Categoria from '../models/Categoria.js'
import { requireAuth } from './auth.js'

const router = Router()
router.use(requireAuth)

// GET /api/admin/reportes?fecha_desde=&fecha_hasta=&categoria_id=&producto_id=
router.get('/', async (req, res) => {
  try {
    const { fecha_desde, fecha_hasta, categoria_id, producto_id } = req.query

    // Rango de fechas
    const buildRange = () => {
      const r = {}
      if (fecha_desde) r[Op.gte] = new Date(fecha_desde)
      if (fecha_hasta) {
        const h = new Date(fecha_hasta)
        h.setDate(h.getDate() + 1)
        r[Op.lt] = h
      }
      return r
    }
    const rangoFecha = (fecha_desde || fecha_hasta) ? buildRange() : null

    // Filtro de producto/categoría en include
    const whereProducto = {}
    if (producto_id)  whereProducto.id           = producto_id
    if (categoria_id) whereProducto.categoria_id = categoria_id
    const filtrarProd = !!(producto_id || categoria_id)

    const inclProd = {
      model: Producto,
      as: 'producto',
      attributes: ['id', 'codigo', 'nombre'],
      include: [{ model: Categoria, as: 'categoria', attributes: ['id', 'nombre'] }],
      ...(filtrarProd ? { where: whereProducto, required: true } : {}),
    }

    // ── Ventas (POS) ────────────────────────────────────────────────────────
    const ventas = await Venta.findAll({
      where: rangoFecha ? { fecha: rangoFecha } : {},
      include: [{
        model: VentaItem, as: 'items',
        include: [inclProd],
        ...(filtrarProd ? { required: true } : {}),
      }],
      order: [['fecha', 'DESC']],
      limit: 2000,
    })

    // ── Pedidos (online) ─────────────────────────────────────────────────────
    const pedidos = await Pedido.findAll({
      where: rangoFecha ? { fecha: rangoFecha } : {},
      include: [{
        model: PedidoItem, as: 'items',
        include: [inclProd],
        ...(filtrarProd ? { required: true } : {}),
      }],
      order: [['fecha', 'DESC']],
      limit: 2000,
    })

    // ── Unificar operaciones ─────────────────────────────────────────────────
    const mapItem = i => ({
      categoria:  i.producto?.categoria?.nombre || '—',
      producto:   i.producto?.nombre  || '—',
      codigo:     i.producto?.codigo  || '—',
      cantidad:   i.cantidad,
      precio_unit: parseFloat(i.precio_unit || 0),
      subtotal:   parseFloat(i.subtotal || 0),
    })

    const operaciones = [
      ...ventas.map(v => ({
        id:         `V-${v.id}`,
        fecha:      v.fecha,
        origen:     v.tipo === 'online' ? 'Online' : 'Local',
        cliente:    '—',
        metodo_pago: v.metodo_pago || '—',
        entrega:    'Retiro',
        total:      parseFloat(v.total),
        items:      (v.items || []).map(mapItem),
      })),
      ...pedidos.map(p => ({
        id:         `P-${p.id}`,
        fecha:      p.fecha,
        origen:     'Online',
        cliente:    p.nombre || '—',
        telefono:   p.telefono || '',
        metodo_pago: p.metodo_pago || '—',
        entrega:    p.direccion ? 'Delivery' : 'Retiro',
        total:      parseFloat(p.total),
        items:      (p.items || []).map(mapItem),
      })),
    ].sort((a, b) => new Date(b.fecha) - new Date(a.fecha))

    // ── Detalle plano ────────────────────────────────────────────────────────
    const detalle = []
    for (const op of operaciones) {
      for (const item of op.items) {
        detalle.push({
          operacion_id: op.id,
          fecha:        op.fecha,
          origen:       op.origen,
          cliente:      op.cliente,
          ...item,
        })
      }
    }

    // ── Resumen por producto ─────────────────────────────────────────────────
    const resumenMap = {}
    let totalGlobal = 0
    for (const d of detalle) {
      const key = d.codigo !== '—' ? d.codigo : d.producto
      if (!resumenMap[key]) {
        resumenMap[key] = { categoria: d.categoria, producto: d.producto, codigo: d.codigo, cantidad: 0, total: 0, precio_unit: d.precio_unit }
      }
      resumenMap[key].cantidad += d.cantidad
      resumenMap[key].total    += d.subtotal
      totalGlobal              += d.subtotal
    }
    const resumen = Object.values(resumenMap)
      .sort((a, b) => b.total - a.total)
      .map(r => ({ ...r, pct: totalGlobal > 0 ? parseFloat((r.total / totalGlobal * 100).toFixed(1)) : 0 }))

    // ── Por categoría (gráfico) ──────────────────────────────────────────────
    const catMap = {}
    for (const d of detalle) {
      catMap[d.categoria] = (catMap[d.categoria] || 0) + d.subtotal
    }
    const por_categoria = Object.entries(catMap)
      .map(([cat, total]) => ({ categoria: cat, total, pct: totalGlobal > 0 ? parseFloat((total / totalGlobal * 100).toFixed(1)) : 0 }))
      .sort((a, b) => b.total - a.total)

    // ── Por día (gráfico) ────────────────────────────────────────────────────
    const diaMap = {}
    for (const op of operaciones) {
      const dia = String(op.fecha).slice(0, 10)
      diaMap[dia] = (diaMap[dia] || 0) + op.total
    }
    const por_dia = Object.entries(diaMap)
      .map(([dia, total]) => ({ dia, total }))
      .sort((a, b) => a.dia.localeCompare(b.dia))

    // ── KPIs ─────────────────────────────────────────────────────────────────
    const kpis = {
      total:          totalGlobal,
      n_operaciones:  operaciones.length,
      ticket_promedio: operaciones.length > 0 ? Math.round(totalGlobal / operaciones.length) : 0,
      unidades:       detalle.reduce((s, d) => s + d.cantidad, 0),
    }

    res.json({ kpis, operaciones, detalle, resumen, por_categoria, por_dia })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

export default router
