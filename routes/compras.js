import { Router } from 'express'
import { Op } from 'sequelize'
import multer from 'multer'
import { dirname, join, extname } from 'path'
import { fileURLToPath } from 'url'
import { sequelize } from '../database.js'
import Compra from '../models/Compra.js'
import CompraItem from '../models/CompraItem.js'
import Insumo from '../models/Insumo.js'
import MovimientoInsumo from '../models/MovimientoInsumo.js'
import Producto from '../models/Producto.js'
import Categoria from '../models/Categoria.js'
import CuentaCorriente from '../models/CuentaCorriente.js'
import MovimientoCuenta from '../models/MovimientoCuenta.js'
import Gasto from '../models/Gasto.js'
import { requireAuth } from './auth.js'

// ── Compras ─────────────────────────────────────────────────────────────────
// Una compra a un proveedor puede llevar insumos (suman stock de insumos y actualizan su costo)
// y productos para revender (suman stock del producto y actualizan su precio de costo).
//   · Contado  → genera el gasto (Materia Prima / Mercadería para reventa) y sale de la caja.
//   · A cuenta → genera un cargo en la cuenta corriente del proveedor; el gasto aparece cuando se le paga.
// Anular una compra revierte stock, costos, gastos y cargo.

const __dirname = dirname(fileURLToPath(import.meta.url))
const router = Router()
router.use(requireAuth)

const METODOS      = ['efectivo', 'transferencia', 'debito', 'credito', 'qr']
const COMPROBANTES = ['factura_a', 'factura_b', 'factura_c', 'ticket', 'remito', 'sin_comprobante']
const ALICUOTAS    = [10.5, 21, 27]
const RUBRO = { insumo: 'Materia Prima', producto: 'Mercadería para reventa' }

const upload = multer({
  storage: multer.diskStorage({
    destination: join(__dirname, '../public/uploads/comprobantes'),
    filename: (req, file, cb) => cb(null, `compra_${Date.now()}${extname(file.originalname).toLowerCase()}`),
  }),
  fileFilter: (req, file, cb) => {
    const ok = /image\/(jpeg|png|webp)|application\/pdf/.test(file.mimetype)
    ok ? cb(null, true) : cb(new Error('Solo imágenes o PDF'))
  },
  limits: { fileSize: 10 * 1024 * 1024 },
})

const redondear = n => Math.round(n * 100) / 100
const ivaIncluido = (monto, alic) => (alic ? redondear(monto * alic / (100 + alic)) : null)

function soloAdmin(req, res, next) {
  if (req.admin?.rol && req.admin.rol !== 'admin') return res.status(403).json({ error: 'Solo el administrador puede manejar compras' })
  next()
}
router.use(soloAdmin)

// GET /api/compras/catalogo — lo que se puede comprar: insumos y productos (con costo actual)
router.get('/catalogo', async (req, res) => {
  try {
    const [insumos, productos] = await Promise.all([
      Insumo.findAll({ where: { activo: true }, order: [['nombre', 'ASC']] }),
      Producto.unscoped().findAll({
        where: { activo: true },
        attributes: ['id', 'codigo', 'nombre', 'precio', 'stock', 'precio_costo', 'categoria_id'],
        include: [{ model: Categoria, as: 'categoria', attributes: ['id', 'codigo', 'nombre'] }],
        order: [['nombre', 'ASC']],
      }),
    ])
    res.json({ insumos, productos })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/compras?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&cuenta_id=&estado=
router.get('/', async (req, res) => {
  try {
    const { desde, hasta, cuenta_id, estado } = req.query
    const where = {}
    if (desde || hasta) {
      where.fecha = {}
      if (desde) where.fecha[Op.gte] = desde
      if (hasta) where.fecha[Op.lte] = hasta
    }
    if (cuenta_id) where.cuenta_id = cuenta_id
    if (estado) where.estado = estado
    const compras = await Compra.findAll({
      where,
      include: [{ model: CompraItem, as: 'items' }],
      order: [['fecha', 'DESC'], ['id', 'DESC']],
      limit: 2000,
    })
    res.json(compras)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/compras — multipart: "datos" (JSON) + "comprobante" (foto/PDF opcional)
router.post('/', upload.single('comprobante'), async (req, res) => {
  let d
  try { d = JSON.parse(req.body.datos || '{}') } catch { return res.status(400).json({ error: 'Datos inválidos' }) }

  const t = await sequelize.transaction()
  try {
    // ── Validaciones ──
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha || '')) throw new Error('Fecha inválida')
    const cuenta = await CuentaCorriente.findByPk(d.cuenta_id, { transaction: t })
    if (!cuenta || cuenta.tipo !== 'proveedor') throw new Error('Elegí el proveedor')
    if (!['contado', 'cuenta_corriente'].includes(d.condicion)) throw new Error('Elegí si es al contado o a cuenta')
    if (d.condicion === 'contado' && !METODOS.includes(d.metodo_pago)) throw new Error('Elegí con qué se pagó')
    const tipoComp = COMPROBANTES.includes(d.tipo_comprobante) ? d.tipo_comprobante : 'sin_comprobante'
    const alic = tipoComp === 'factura_a' && ALICUOTAS.includes(Number(d.alicuota_iva)) ? Number(d.alicuota_iva) : null
    if (!Array.isArray(d.items) || !d.items.length) throw new Error('Agregá al menos un renglón')

    // ── Renglones ──
    const renglones = []
    for (const [i, it] of d.items.entries()) {
      const cantidad = Number(it.cantidad)
      const costo = Number(it.costo_unitario)
      if (!(cantidad > 0)) throw new Error(`Renglón ${i + 1}: la cantidad tiene que ser mayor a 0`)
      if (!(costo >= 0)) throw new Error(`Renglón ${i + 1}: costo inválido`)
      if (it.tipo === 'insumo') {
        const insumo = await Insumo.findByPk(it.insumo_id, { transaction: t, lock: t.LOCK.UPDATE })
        if (!insumo) throw new Error(`Renglón ${i + 1}: insumo no encontrado`)
        renglones.push({ tipo: 'insumo', obj: insumo, cantidad, costo })
      } else if (it.tipo === 'producto') {
        if (!Number.isInteger(cantidad)) throw new Error(`Renglón ${i + 1}: los productos se compran por unidad (sin decimales)`)
        const producto = await Producto.unscoped().findByPk(it.producto_id, { transaction: t, lock: t.LOCK.UPDATE })
        if (!producto) throw new Error(`Renglón ${i + 1}: producto no encontrado`)
        renglones.push({ tipo: 'producto', obj: producto, cantidad, costo })
      } else throw new Error(`Renglón ${i + 1}: tipo inválido`)
    }
    const total = redondear(renglones.reduce((a, r) => a + redondear(r.cantidad * r.costo), 0))
    if (!(total > 0)) throw new Error('El total de la compra tiene que ser mayor a 0')

    const usuario = req.admin?.usuario || null
    const compra = await Compra.create({
      fecha: d.fecha, cuenta_id: cuenta.id, proveedor: cuenta.nombre,
      tipo_comprobante: tipoComp, nro_comprobante: (d.nro_comprobante || '').trim() || null,
      condicion: d.condicion, metodo_pago: d.condicion === 'contado' ? d.metodo_pago : null,
      alicuota_iva: alic, iva_monto: ivaIncluido(total, alic), total,
      nota: (d.nota || '').trim() || null,
      comprobante: req.file ? `/uploads/comprobantes/${req.file.filename}` : null,
      usuario,
    }, { transaction: t })
    const ref = `Compra #${compra.id} — ${cuenta.nombre}`

    // ── Stock y costos ──
    for (const r of renglones) {
      const subtotal = redondear(r.cantidad * r.costo)
      if (r.tipo === 'insumo') {
        const ins = r.obj
        const stock = redondear3(Number(ins.stock) + r.cantidad)
        await CompraItem.create({
          compra_id: compra.id, tipo: 'insumo', insumo_id: ins.id, descripcion: ins.nombre, unidad: ins.unidad,
          cantidad: r.cantidad, costo_unitario: r.costo, subtotal, costo_anterior: ins.costo_unitario,
        }, { transaction: t })
        await ins.update({ stock, ...(r.costo > 0 ? { costo_unitario: r.costo } : {}) }, { transaction: t })
        await MovimientoInsumo.create({ insumo_id: ins.id, tipo: 'compra', cantidad: r.cantidad, stock_resultante: stock, referencia: ref, usuario }, { transaction: t })
      } else {
        const prod = r.obj
        await CompraItem.create({
          compra_id: compra.id, tipo: 'producto', producto_id: prod.id, descripcion: prod.nombre, unidad: 'unidad',
          cantidad: r.cantidad, costo_unitario: r.costo, subtotal, costo_anterior: prod.precio_costo,
        }, { transaction: t })
        await prod.update({ stock: prod.stock + r.cantidad, ...(r.costo > 0 ? { precio_costo: r.costo } : {}) }, { transaction: t })
      }
    }

    // ── Plata: gasto (contado) o cargo en la cuenta del proveedor (a cuenta) ──
    const comprobanteTxt = tipoComp !== 'sin_comprobante' ? ` (${tipoComp.replace('_', ' ')}${compra.nro_comprobante ? ' ' + compra.nro_comprobante : ''})` : ''
    if (d.condicion === 'contado') {
      for (const tipo of ['insumo', 'producto']) {
        const lista = renglones.filter(r => r.tipo === tipo)
        if (!lista.length) continue
        const monto = redondear(lista.reduce((a, r) => a + redondear(r.cantidad * r.costo), 0))
        if (!(monto > 0)) continue
        const detalle = lista.slice(0, 3).map(r => r.obj.nombre).join(', ') + (lista.length > 3 ? ` y ${lista.length - 3} más` : '')
        await Gasto.create({
          fecha: d.fecha, categoria: RUBRO[tipo],
          descripcion: `Compra #${compra.id}: ${detalle}${comprobanteTxt}`.slice(0, 500),
          monto, proveedor: cuenta.nombre, comprobante: compra.comprobante, metodo_pago: d.metodo_pago,
          es_factura: !!alic, alicuota_iva: alic, iva_monto: ivaIncluido(monto, alic), compra_id: compra.id,
        }, { transaction: t })
      }
    } else {
      await MovimientoCuenta.create({
        cuenta_id: cuenta.id, fecha: d.fecha, tipo: 'cargo',
        concepto: `Compra #${compra.id}${comprobanteTxt}`, monto: total, compra_id: compra.id,
      }, { transaction: t })
    }

    await t.commit()
    const completa = await Compra.findByPk(compra.id, { include: [{ model: CompraItem, as: 'items' }] })
    res.status(201).json(completa)
  } catch (err) {
    await t.rollback()
    res.status(400).json({ error: err.message })
  }
})

function redondear3(n) { return Math.round(n * 1000) / 1000 }

// POST /api/compras/:id/anular — revierte stock, costos, gasto y cargo. La compra queda en el historial como anulada.
router.post('/:id/anular', async (req, res) => {
  const t = await sequelize.transaction()
  try {
    const compra = await Compra.findByPk(req.params.id, { include: [{ model: CompraItem, as: 'items' }], transaction: t, lock: t.LOCK.UPDATE })
    if (!compra) throw new Error('Compra no encontrada')
    if (compra.estado === 'anulada') throw new Error('La compra ya está anulada')
    const usuario = req.admin?.usuario || null
    const ref = `Anulación compra #${compra.id}`

    for (const it of compra.items) {
      // Costo a restaurar: el de la última compra vigente de ese ítem (sin contar esta) o el que tenía antes
      const anterior = await CompraItem.findOne({
        where: { id: { [Op.ne]: it.id }, ...(it.tipo === 'insumo' ? { insumo_id: it.insumo_id } : { producto_id: it.producto_id }) },
        include: [{ model: Compra, as: 'compra', where: { estado: 'vigente', id: { [Op.ne]: compra.id } }, attributes: [] }],
        order: [[{ model: Compra, as: 'compra' }, 'fecha', 'DESC'], ['id', 'DESC']],
        transaction: t,
      })
      const costo = anterior ? anterior.costo_unitario : it.costo_anterior

      if (it.tipo === 'insumo') {
        const ins = await Insumo.findByPk(it.insumo_id, { transaction: t, lock: t.LOCK.UPDATE })
        if (!ins) continue
        const stock = redondear3(Number(ins.stock) - Number(it.cantidad))
        await ins.update({ stock, ...(costo != null ? { costo_unitario: costo } : {}) }, { transaction: t })
        await MovimientoInsumo.create({ insumo_id: ins.id, tipo: 'anulacion', cantidad: -Number(it.cantidad), stock_resultante: stock, referencia: ref, usuario }, { transaction: t })
      } else {
        const prod = await Producto.unscoped().findByPk(it.producto_id, { transaction: t, lock: t.LOCK.UPDATE })
        if (!prod) continue
        await prod.update({ stock: prod.stock - Number(it.cantidad), precio_costo: costo }, { transaction: t })
      }
    }

    await Gasto.destroy({ where: { compra_id: compra.id }, transaction: t })
    await MovimientoCuenta.destroy({ where: { compra_id: compra.id }, transaction: t })
    await compra.update({ estado: 'anulada', anulada_por: usuario, anulada_el: new Date() }, { transaction: t })

    await t.commit()
    res.json({ ok: true })
  } catch (err) {
    await t.rollback()
    res.status(400).json({ error: err.message })
  }
})

export default router
