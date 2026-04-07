import { Router } from 'express'
import { Op } from 'sequelize'
import Producto from '../models/Producto.js'
import Categoria from '../models/Categoria.js'
import AjusteStock from '../models/AjusteStock.js'
import { requireAuth } from './auth.js'

const router = Router()

// GET /api/productos
router.get('/', async (req, res) => {
  try {
    const { categoria, search, featured, limit = 100 } = req.query
    const where = { activo: true }

    if (categoria && categoria !== 'todos') {
      // buscar por código de categoría o id
      const cat = await Categoria.findOne({ where: { codigo: categoria.toUpperCase() } })
      if (cat) where.categoria_id = cat.id
    }

    if (search) {
      where[Op.or] = [
        { nombre:        { [Op.like]: `%${search}%` } },
        { codigo:        { [Op.like]: `%${search}%` } },
        { codigo_barras: { [Op.like]: `%${search}%` } },
      ]
    }

    const productos = await Producto.findAll({
      where,
      include: [{ model: Categoria, as: 'categoria', attributes: ['id', 'codigo', 'nombre'] }],
      limit: parseInt(limit),
      order: [['nombre', 'ASC']],
    })

    // Para "featured" devolver solo los primeros 6
    if (featured) return res.json(productos.slice(0, 6))
    res.json(productos)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/productos/barcode/:codigo  (admin)
router.get('/barcode/:codigo', requireAuth, async (req, res) => {
  try {
    const codigo = req.params.codigo.replace(/\*/g, '').trim()
    const producto = await Producto.findOne({
      where: {
        activo: true,
        [Op.or]: [
          { codigo: { [Op.like]: codigo } },
          { codigo_barras: { [Op.like]: codigo } },
        ],
      },
      include: [{ model: Categoria, as: 'categoria', attributes: ['id', 'codigo', 'nombre'] }],
    })
    if (!producto) return res.status(404).json({ error: 'Producto no encontrado' })
    res.json(producto)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/productos/:id
router.get('/:id', async (req, res) => {
  try {
    const producto = await Producto.findByPk(req.params.id, {
      include: [{ model: Categoria, as: 'categoria', attributes: ['id', 'codigo', 'nombre'] }],
    })
    if (!producto) return res.status(404).json({ error: 'Producto no encontrado' })
    res.json(producto)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/productos/:id/stock  (admin)
router.put('/:id/stock', requireAuth, async (req, res) => {
  try {
    const { delta } = req.body  // positivo = entrada, negativo = salida
    const producto = await Producto.findByPk(req.params.id)
    if (!producto) return res.status(404).json({ error: 'Producto no encontrado' })
    const nuevoStock = producto.stock + parseInt(delta)
    if (nuevoStock < 0) return res.status(400).json({ error: 'Stock insuficiente' })
    await producto.update({ stock: nuevoStock })
    res.json(producto)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/productos  (admin - crear producto)
router.post('/', requireAuth, async (req, res) => {
  try {
    const { codigo, nombre, categoria_id, codigo_barras, precio, stock, activo } = req.body
    if (!codigo || !nombre) return res.status(400).json({ error: 'Código y nombre son obligatorios' })
    const producto = await Producto.create({
      codigo,
      nombre,
      categoria_id: categoria_id || null,
      codigo_barras: codigo_barras || null,
      precio:  precio  ?? 0,
      stock:   stock   ?? 0,
      activo:  activo  ?? true,
    })
    const productoConCat = await Producto.findByPk(producto.id, {
      include: [{ model: Categoria, as: 'categoria', attributes: ['id', 'codigo', 'nombre'] }],
    })
    res.status(201).json(productoConCat)
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ error: `El código "${req.body.codigo}" ya existe` })
    }
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/productos/:id  (admin - soft-delete: desactiva sin borrar historial)
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const producto = await Producto.findByPk(req.params.id)
    if (!producto) return res.status(404).json({ error: 'Producto no encontrado' })
    await producto.update({ activo: false })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/productos/:id  (admin - editar producto)
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const producto = await Producto.findByPk(req.params.id)
    if (!producto) return res.status(404).json({ error: 'Producto no encontrado' })
    const { nombre, precio, activo, codigo, codigo_barras, categoria_id } = req.body
    const updates = {}
    if (nombre        !== undefined) updates.nombre        = nombre
    if (precio        !== undefined) updates.precio        = precio
    if (activo        !== undefined) updates.activo        = activo
    if (codigo        !== undefined) updates.codigo        = codigo
    if (codigo_barras !== undefined) updates.codigo_barras = codigo_barras
    if (categoria_id  !== undefined) updates.categoria_id  = categoria_id
    // stock NO se actualiza aquí — solo via /ajuste-stock o produccion
    await producto.update(updates)
    res.json(producto)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/productos/:id/ajuste-stock — edición manual de stock con registro
router.put('/:id/ajuste-stock', requireAuth, async (req, res) => {
  try {
    const producto = await Producto.findByPk(req.params.id)
    if (!producto) return res.status(404).json({ error: 'Producto no encontrado' })

    const { stock_nuevo, observacion, usuario } = req.body
    if (stock_nuevo === undefined || stock_nuevo === null || stock_nuevo === '')
      return res.status(400).json({ error: 'stock_nuevo es requerido' })

    const stockAnterior = producto.stock
    const stockNuevo    = parseInt(stock_nuevo)
    const diferencia    = stockNuevo - stockAnterior

    await producto.update({ stock: stockNuevo })

    const ajuste = await AjusteStock.create({
      producto_id:    producto.id,
      stock_anterior: stockAnterior,
      stock_nuevo:    stockNuevo,
      diferencia,
      observacion:    observacion || null,
      usuario:        usuario || null,
    })

    res.json({ ok: true, ajuste, stock: stockNuevo })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/productos/:id/ajustes — historial de ajustes de un producto
router.get('/:id/ajustes', requireAuth, async (req, res) => {
  try {
    const ajustes = await AjusteStock.findAll({
      where: { producto_id: req.params.id },
      order: [['createdAt', 'DESC']],
      limit: 50,
    })
    res.json(ajustes)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/productos/ajustes/todos — historial global de ajustes
router.get('/ajustes/todos', requireAuth, async (req, res) => {
  try {
    const ajustes = await AjusteStock.findAll({
      include: [{ model: Producto, as: 'producto', attributes: ['id', 'codigo', 'nombre'] }],
      order: [['createdAt', 'DESC']],
      limit: 100,
    })
    res.json(ajustes)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
