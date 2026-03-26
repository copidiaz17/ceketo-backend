import { Router } from 'express'
import { Op } from 'sequelize'
import multer from 'multer'
import { dirname, join, extname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync, unlinkSync } from 'fs'
import Gasto from '../models/Gasto.js'
import { requireAuth } from './auth.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const router = Router()
router.use(requireAuth)

const CATEGORIAS = [
  'Materia Prima', 'Alquiler', 'Servicios',
  'Sueldos', 'Mantenimiento', 'Packaging', 'Otros',
]

// Multer — comprobantes
const storage = multer.diskStorage({
  destination: join(__dirname, '../public/uploads/comprobantes'),
  filename: (req, file, cb) => {
    const ext  = extname(file.originalname).toLowerCase()
    const name = `comp_${Date.now()}${ext}`
    cb(null, name)
  },
})
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ok = /image\/(jpeg|png|webp)|application\/pdf/.test(file.mimetype)
    ok ? cb(null, true) : cb(new Error('Solo imágenes o PDF'))
  },
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
})

// ── GET /api/gastos ─────────────────────────────────────────────
// Query: mes=2025-03, categoria=Alquiler
router.get('/', async (req, res) => {
  try {
    const { mes, categoria } = req.query
    const where = {}
    if (mes) {
      const [y, m] = mes.split('-')
      const from = `${y}-${m}-01`
      const daysInMonth = new Date(y, m, 0).getDate()
      const to   = `${y}-${m}-${daysInMonth}`
      where.fecha = { [Op.between]: [from, to] }
    }
    if (categoria) where.categoria = categoria

    const gastos = await Gasto.findAll({
      where,
      order: [['fecha', 'DESC'], ['id', 'DESC']],
    })
    res.json(gastos)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/gastos/categorias ───────────────────────────────────
router.get('/categorias', (req, res) => {
  res.json(CATEGORIAS)
})

// ── GET /api/gastos/resumen ──────────────────────────────────────
// Totales por categoría del mes actual
router.get('/resumen', async (req, res) => {
  try {
    const { mes } = req.query
    const hoy = new Date()
    const y = mes ? mes.split('-')[0] : hoy.getFullYear()
    const m = mes ? mes.split('-')[1] : String(hoy.getMonth() + 1).padStart(2, '0')
    const daysInMonth = new Date(y, m, 0).getDate()
    const from = `${y}-${m}-01`
    const to   = `${y}-${m}-${daysInMonth}`

    const gastos = await Gasto.findAll({
      where: { fecha: { [Op.between]: [from, to] } },
      attributes: ['categoria', 'monto'],
    })

    const totales = {}
    let totalMes = 0
    for (const g of gastos) {
      totales[g.categoria] = (totales[g.categoria] || 0) + Number(g.monto)
      totalMes += Number(g.monto)
    }
    res.json({ totales, totalMes, mes: `${y}-${m}` })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/gastos ─────────────────────────────────────────────
router.post('/', upload.single('comprobante'), async (req, res) => {
  try {
    const { fecha, categoria, descripcion, monto, proveedor, es_factura, alicuota_iva } = req.body
    if (!fecha || !categoria || !descripcion || !monto)
      return res.status(400).json({ error: 'Faltan campos obligatorios' })
    if (!CATEGORIAS.includes(categoria))
      return res.status(400).json({ error: 'Categoría inválida' })

    const comprobante = req.file
      ? `/uploads/comprobantes/${req.file.filename}`
      : null

    const montoNum     = parseFloat(monto)
    const esFactura    = es_factura === 'true' || es_factura === true
    const alicuota     = esFactura && alicuota_iva ? parseFloat(alicuota_iva) : null
    const ivaMonto     = alicuota ? parseFloat((montoNum * alicuota / (100 + alicuota)).toFixed(2)) : null

    const gasto = await Gasto.create({
      fecha, categoria, descripcion,
      monto: montoNum,
      proveedor: proveedor || null,
      comprobante,
      es_factura: esFactura,
      alicuota_iva: alicuota,
      iva_monto: ivaMonto,
    })
    res.status(201).json(gasto)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── PUT /api/gastos/:id ──────────────────────────────────────────
router.put('/:id', upload.single('comprobante'), async (req, res) => {
  try {
    const gasto = await Gasto.findByPk(req.params.id)
    if (!gasto) return res.status(404).json({ error: 'Gasto no encontrado' })

    const { fecha, categoria, descripcion, monto, proveedor, es_factura, alicuota_iva } = req.body
    if (categoria && !CATEGORIAS.includes(categoria))
      return res.status(400).json({ error: 'Categoría inválida' })

    if (req.file && gasto.comprobante) {
      const old = join(__dirname, '../public', gasto.comprobante)
      if (existsSync(old)) unlinkSync(old)
    }

    const montoNum  = monto ? parseFloat(monto) : gasto.monto
    const esFactura = es_factura !== undefined ? (es_factura === 'true' || es_factura === true) : gasto.es_factura
    const alicuota  = esFactura && alicuota_iva ? parseFloat(alicuota_iva) : (esFactura ? gasto.alicuota_iva : null)
    const ivaMonto  = alicuota ? parseFloat((montoNum * alicuota / (100 + alicuota)).toFixed(2)) : null

    await gasto.update({
      fecha:        fecha       || gasto.fecha,
      categoria:    categoria   || gasto.categoria,
      descripcion:  descripcion || gasto.descripcion,
      monto:        montoNum,
      proveedor:    proveedor !== undefined ? (proveedor || null) : gasto.proveedor,
      comprobante:  req.file ? `/uploads/comprobantes/${req.file.filename}` : gasto.comprobante,
      es_factura:   esFactura,
      alicuota_iva: alicuota,
      iva_monto:    ivaMonto,
    })
    res.json(gasto)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── DELETE /api/gastos/:id ───────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const gasto = await Gasto.findByPk(req.params.id)
    if (!gasto) return res.status(404).json({ error: 'Gasto no encontrado' })

    // Borrar comprobante del disco
    if (gasto.comprobante) {
      const filePath = join(__dirname, '../public', gasto.comprobante)
      if (existsSync(filePath)) unlinkSync(filePath)
    }

    await gasto.destroy()
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
