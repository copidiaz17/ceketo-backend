import { Router } from 'express'
import multer from 'multer'
import { dirname, join, extname } from 'path'
import { fileURLToPath } from 'url'
import Producto from '../models/Producto.js'
import { requireAuth } from './auth.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const router = Router()
router.use(requireAuth)

const storage = multer.diskStorage({
  destination: join(__dirname, '../public/uploads/productos'),
  filename: (req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase()
    cb(null, `prod_${req.params.id}${ext}`)
  },
})
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (/image\/(jpeg|png|webp|gif)/.test(file.mimetype)) cb(null, true)
    else cb(new Error('Solo imágenes JPG/PNG/WEBP'))
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
})

// POST /api/uploads/producto/:id
router.post('/producto/:id', upload.single('imagen'), async (req, res) => {
  try {
    const producto = await Producto.findByPk(req.params.id)
    if (!producto) return res.status(404).json({ error: 'Producto no encontrado' })
    if (!req.file)  return res.status(400).json({ error: 'Sin archivo' })

    const rutaImg = `/uploads/productos/${req.file.filename}`
    await producto.update({ imagen: rutaImg })
    res.json({ ok: true, imagen: rutaImg })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
