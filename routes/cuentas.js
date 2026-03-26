import { Router } from 'express'
import { sequelize } from '../database.js'
import CuentaCorriente from '../models/CuentaCorriente.js'
import MovimientoCuenta from '../models/MovimientoCuenta.js'
import Gasto from '../models/Gasto.js'
import { requireAuth } from './auth.js'

const router = Router()
router.use(requireAuth)

// ── Cuentas ─────────────────────────────────────────────────────

// GET /api/cuentas  — lista con saldo calculado
router.get('/', async (req, res) => {
  try {
    const cuentas = await CuentaCorriente.findAll({
      include: [{ model: MovimientoCuenta, as: 'movimientos', attributes: ['tipo', 'monto'] }],
      order: [['nombre', 'ASC']],
    })

    const result = cuentas.map(c => {
      const saldo = c.movimientos.reduce((acc, m) => {
        return m.tipo === 'cargo' ? acc + Number(m.monto) : acc - Number(m.monto)
      }, 0)
      const { movimientos, ...data } = c.toJSON()
      return { ...data, saldo }
    })

    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/cuentas
router.post('/', async (req, res) => {
  try {
    const { tipo, nombre, telefono, email, notas } = req.body
    if (!tipo || !nombre) return res.status(400).json({ error: 'tipo y nombre son requeridos' })
    const cuenta = await CuentaCorriente.create({ tipo, nombre, telefono, email, notas })
    res.status(201).json(cuenta)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/cuentas/:id
router.put('/:id', async (req, res) => {
  try {
    const cuenta = await CuentaCorriente.findByPk(req.params.id)
    if (!cuenta) return res.status(404).json({ error: 'No encontrada' })
    const { tipo, nombre, telefono, email, notas } = req.body
    await cuenta.update({ tipo, nombre, telefono, email, notas })
    res.json(cuenta)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/cuentas/:id
router.delete('/:id', async (req, res) => {
  const t = await sequelize.transaction()
  try {
    const cuenta = await CuentaCorriente.findByPk(req.params.id, { transaction: t })
    if (!cuenta) { await t.rollback(); return res.status(404).json({ error: 'No encontrada' }) }
    await MovimientoCuenta.destroy({ where: { cuenta_id: req.params.id }, transaction: t })
    await cuenta.destroy({ transaction: t })
    await t.commit()
    res.json({ ok: true })
  } catch (err) {
    await t.rollback()
    res.status(500).json({ error: err.message })
  }
})

// ── Movimientos ──────────────────────────────────────────────────

// GET /api/cuentas/:id/movimientos
router.get('/:id/movimientos', async (req, res) => {
  try {
    const cuenta = await CuentaCorriente.findByPk(req.params.id)
    if (!cuenta) return res.status(404).json({ error: 'No encontrada' })

    const movimientos = await MovimientoCuenta.findAll({
      where: { cuenta_id: req.params.id },
      order: [['fecha', 'DESC'], ['id', 'DESC']],
    })

    // Calcular saldo acumulado (orden cronológico)
    const ordenados = [...movimientos].reverse()
    let acum = 0
    const conSaldo = ordenados.map(m => {
      acum = m.tipo === 'cargo' ? acum + Number(m.monto) : acum - Number(m.monto)
      return { ...m.toJSON(), saldo_acum: acum }
    }).reverse()

    res.json({ cuenta, movimientos: conSaldo, saldo: acum })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/cuentas/:id/movimientos
router.post('/:id/movimientos', async (req, res) => {
  const t = await sequelize.transaction()
  try {
    const cuenta = await CuentaCorriente.findByPk(req.params.id, { transaction: t })
    if (!cuenta) { await t.rollback(); return res.status(404).json({ error: 'No encontrada' }) }

    const { fecha, tipo, concepto, monto } = req.body
    if (!fecha || !tipo || !concepto || !monto) {
      await t.rollback()
      return res.status(400).json({ error: 'Faltan campos requeridos' })
    }

    let gasto_id = null

    // Si es pago a proveedor → crear gasto automáticamente
    if (cuenta.tipo === 'proveedor' && tipo === 'pago') {
      const gasto = await Gasto.create({
        fecha,
        categoria: 'Materia Prima',
        descripcion: `Pago cta. cte. — ${cuenta.nombre}: ${concepto}`,
        monto,
        proveedor: cuenta.nombre,
      }, { transaction: t })
      gasto_id = gasto.id
    }

    const mov = await MovimientoCuenta.create(
      { cuenta_id: req.params.id, fecha, tipo, concepto, monto, gasto_id },
      { transaction: t }
    )

    await t.commit()
    res.status(201).json({ ...mov.toJSON(), gasto_creado: gasto_id !== null })
  } catch (err) {
    await t.rollback()
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/cuentas/:id/movimientos/:movId
router.delete('/:id/movimientos/:movId', async (req, res) => {
  const t = await sequelize.transaction()
  try {
    const mov = await MovimientoCuenta.findOne({
      where: { id: req.params.movId, cuenta_id: req.params.id },
      transaction: t,
    })
    if (!mov) { await t.rollback(); return res.status(404).json({ error: 'Movimiento no encontrado' }) }

    // Si tenía gasto asociado, eliminarlo también
    if (mov.gasto_id) {
      await Gasto.destroy({ where: { id: mov.gasto_id }, transaction: t })
    }

    await mov.destroy({ transaction: t })
    await t.commit()
    res.json({ ok: true })
  } catch (err) {
    await t.rollback()
    res.status(500).json({ error: err.message })
  }
})

export default router
