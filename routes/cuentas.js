import { Router } from 'express'
import { sequelize } from '../database.js'
import CuentaCorriente from '../models/CuentaCorriente.js'
import MovimientoCuenta from '../models/MovimientoCuenta.js'
import Gasto from '../models/Gasto.js'
import Venta from '../models/Venta.js'
import VentaItem from '../models/VentaItem.js'
import Producto from '../models/Producto.js'
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

    const { fecha, tipo, concepto, monto, items, metodo_pago } = req.body
    if (!fecha || !tipo || !concepto || !monto) {
      await t.rollback()
      return res.status(400).json({ error: 'Faltan campos requeridos' })
    }

    let gasto_id = null
    let venta_id = null

    // Cargo de cliente con productos → crear Venta y descontar stock
    if (cuenta.tipo === 'cliente' && tipo === 'cargo' && items && items.length) {
      const venta = await Venta.create({
        fecha,
        tipo: 'local',
        total: monto,
        metodo_pago: 'cuenta_corriente',
        nota: `Cta. cte. — ${cuenta.nombre}${concepto ? ': ' + concepto : ''}`,
      }, { transaction: t })

      for (const item of items) {
        const producto = await Producto.findByPk(item.producto_id, { transaction: t })
        if (!producto) throw new Error(`Producto ${item.producto_id} no encontrado`)
        await VentaItem.create({
          venta_id:    venta.id,
          producto_id: item.producto_id,
          cantidad:    item.cantidad,
          precio_unit: item.precio_unit,
          subtotal:    item.subtotal,
        }, { transaction: t })
        await producto.update({ stock: Math.max(0, producto.stock - item.cantidad) }, { transaction: t })
      }
      venta_id = venta.id
    }

    // Pago a proveedor → crear gasto automáticamente
    if (cuenta.tipo === 'proveedor' && tipo === 'pago') {
      const METODOS_VALIDOS = ['efectivo', 'transferencia', 'debito', 'credito', 'qr']
      const gasto = await Gasto.create({
        fecha,
        categoria: 'Materia Prima',
        descripcion: `Pago cta. cte. — ${cuenta.nombre}: ${concepto}`,
        monto,
        proveedor: cuenta.nombre,
        metodo_pago: metodo_pago && METODOS_VALIDOS.includes(metodo_pago) ? metodo_pago : null,
      }, { transaction: t })
      gasto_id = gasto.id
    }

    const METODOS_VALIDOS = ['efectivo', 'transferencia', 'debito', 'credito', 'qr']
    const mov = await MovimientoCuenta.create(
      { cuenta_id: req.params.id, fecha, tipo, concepto, monto, gasto_id, venta_id,
        metodo_pago: metodo_pago && METODOS_VALIDOS.includes(metodo_pago) ? metodo_pago : null },
      { transaction: t }
    )

    await t.commit()
    res.status(201).json({ ...mov.toJSON(), gasto_creado: gasto_id !== null, venta_creada: venta_id !== null })
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

    // Si tenía gasto asociado, eliminarlo
    if (mov.gasto_id) {
      await Gasto.destroy({ where: { id: mov.gasto_id }, transaction: t })
    }

    // Si tenía venta asociada, revertir stock y eliminar
    if (mov.venta_id) {
      const ventaItems = await VentaItem.findAll({ where: { venta_id: mov.venta_id }, transaction: t })
      for (const vi of ventaItems) {
        const producto = await Producto.findByPk(vi.producto_id, { transaction: t })
        if (producto) await producto.update({ stock: producto.stock + vi.cantidad }, { transaction: t })
      }
      await VentaItem.destroy({ where: { venta_id: mov.venta_id }, transaction: t })
      await Venta.destroy({ where: { id: mov.venta_id }, transaction: t })
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
