import { Router } from 'express'
import { Op } from 'sequelize'
import { sequelize } from '../database.js'
import Caja from '../models/Caja.js'
import MovimientoCaja from '../models/MovimientoCaja.js'
import Venta from '../models/Venta.js'
import Gasto from '../models/Gasto.js'
import { requireAuth } from './auth.js'

const router = Router()
router.use(requireAuth)

// ── GET /api/caja/actual ─────────────────────────────────────────
// Devuelve la caja abierta (si existe) con resumen completo
router.get('/actual', async (req, res) => {
  try {
    const caja = await Caja.findOne({ where: { estado: 'abierta' }, order: [['fecha_apertura', 'DESC']] })
    if (!caja) return res.json(null)

    const resumen = await _resumenCaja(caja)
    res.json({ caja, ...resumen })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/caja/historial ──────────────────────────────────────
router.get('/historial', async (req, res) => {
  try {
    const cajas = await Caja.findAll({
      order: [['fecha_apertura', 'DESC']],
      limit: 30,
    })
    res.json(cajas)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/caja/:id ────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const caja = await Caja.findByPk(req.params.id)
    if (!caja) return res.status(404).json({ error: 'Caja no encontrada' })
    const resumen = await _resumenCaja(caja)
    res.json({ caja, ...resumen })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/caja/abrir ─────────────────────────────────────────
router.post('/abrir', async (req, res) => {
  try {
    // Solo puede haber una caja abierta
    const abierta = await Caja.findOne({ where: { estado: 'abierta' } })
    if (abierta) return res.status(400).json({ error: 'Ya hay una caja abierta', caja_id: abierta.id })

    const { saldo_inicial = 0, saldo_billetera_inicial = 0, usuario } = req.body
    const caja = await Caja.create({
      saldo_inicial:           parseFloat(saldo_inicial) || 0,
      saldo_billetera_inicial: parseFloat(saldo_billetera_inicial) || 0,
      usuario:                 usuario || null,
      estado:                  'abierta',
    })
    res.status(201).json(caja)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/caja/:id/movimiento ────────────────────────────────
router.post('/:id/movimiento', async (req, res) => {
  try {
    const caja = await Caja.findByPk(req.params.id)
    if (!caja) return res.status(404).json({ error: 'Caja no encontrada' })
    if (caja.estado === 'cerrada') return res.status(400).json({ error: 'La caja ya está cerrada' })

    const { tipo, concepto, monto } = req.body
    if (!tipo || !concepto || !monto) return res.status(400).json({ error: 'Faltan campos' })
    if (!['ingreso', 'egreso'].includes(tipo)) return res.status(400).json({ error: 'Tipo inválido' })

    const mov = await MovimientoCaja.create({
      caja_id:  caja.id,
      tipo,
      concepto,
      monto: parseFloat(monto),
    })
    res.status(201).json(mov)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── DELETE /api/caja/:id/movimiento/:movId ───────────────────────
router.delete('/:id/movimiento/:movId', async (req, res) => {
  try {
    const mov = await MovimientoCaja.findOne({
      where: { id: req.params.movId, caja_id: req.params.id }
    })
    if (!mov) return res.status(404).json({ error: 'Movimiento no encontrado' })
    await mov.destroy()
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/caja/:id/cerrar ────────────────────────────────────
router.post('/:id/cerrar', async (req, res) => {
  try {
    const caja = await Caja.findByPk(req.params.id)
    if (!caja) return res.status(404).json({ error: 'Caja no encontrada' })
    if (caja.estado === 'cerrada') return res.status(400).json({ error: 'La caja ya está cerrada' })

    const { arqueo_efectivo, nota_cierre } = req.body

    const resumen = await _resumenCaja(caja)
    const { arqueo_billetera } = req.body
    await caja.update({
      estado:           'cerrada',
      fecha_cierre:     new Date(),
      arqueo_efectivo:  arqueo_efectivo !== undefined ? parseFloat(arqueo_efectivo) : null,
      arqueo_billetera: arqueo_billetera !== undefined ? parseFloat(arqueo_billetera) : null,
      nota_cierre:      nota_cierre || null,
    })

    res.json({ ok: true, caja, resumen })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Helper interno ───────────────────────────────────────────────
async function _resumenCaja(caja) {
  const desde = caja.fecha_apertura
  const hasta = caja.fecha_cierre || new Date()

  // Ventas en el período
  const ventas = await Venta.findAll({
    where: { fecha: { [Op.between]: [desde, hasta] } },
    attributes: ['metodo_pago', 'total'],
  })

  // Agrupar ventas por método de pago
  const ventasPorMetodo = {}
  let totalVentas = 0
  for (const v of ventas) {
    const m = v.metodo_pago || 'sin_metodo'
    ventasPorMetodo[m] = (ventasPorMetodo[m] || 0) + parseFloat(v.total)
    totalVentas += parseFloat(v.total)
  }

  // Gastos en el período agrupados por método de pago
  const gastos = await Gasto.findAll({
    where: { fecha: { [Op.between]: [desde.toISOString().split('T')[0], hasta.toISOString().split('T')[0]] } },
    attributes: ['metodo_pago', 'monto'],
  })

  const gastosPorMetodo = {}
  let totalGastos = 0
  for (const g of gastos) {
    const m = g.metodo_pago || 'sin_metodo'
    gastosPorMetodo[m] = (gastosPorMetodo[m] || 0) + parseFloat(g.monto)
    totalGastos += parseFloat(g.monto)
  }

  // Movimientos manuales de caja
  const movimientos = await MovimientoCaja.findAll({
    where: { caja_id: caja.id },
    order: [['createdAt', 'ASC']],
  })

  const totalIngresos = movimientos
    .filter(m => m.tipo === 'ingreso')
    .reduce((acc, m) => acc + parseFloat(m.monto), 0)
  const totalEgresos = movimientos
    .filter(m => m.tipo === 'egreso')
    .reduce((acc, m) => acc + parseFloat(m.monto), 0)

  // Saldo teórico en efectivo
  const efectivoVentas = ventasPorMetodo['efectivo'] || 0
  const efectivoGastos = gastosPorMetodo['efectivo'] || 0
  const saldoTeorico = parseFloat(caja.saldo_inicial) + efectivoVentas - efectivoGastos + totalIngresos - totalEgresos

  // Saldo teórico billetera virtual
  const transferenciaVentas = (ventasPorMetodo['transferencia'] || 0)
  const transferenciaGastos = (gastosPorMetodo['transferencia'] || 0)
  const saldoBilleteraFinal = parseFloat(caja.saldo_billetera_inicial) + transferenciaVentas - transferenciaGastos

  return {
    ventas: ventas.length,
    totalVentas,
    ventasPorMetodo,
    gastosPorMetodo,
    totalGastos,
    movimientos,
    totalIngresos,
    totalEgresos,
    saldoTeorico,
    saldoBilleteraFinal,
    transferenciaVentas,
    transferenciaGastos,
  }
}

export default router
