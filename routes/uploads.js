import { Router } from 'express'
import multer from 'multer'
import { v2 as cloudinary } from 'cloudinary'
import Producto from '../models/Producto.js'
import { requireAuth } from './auth.js'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

const router = Router()
router.use(requireAuth)

// Multer en memoria (no guarda en disco)
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (/image\/(jpeg|png|webp|gif)/.test(file.mimetype)) cb(null, true)
    else cb(new Error('Solo imágenes JPG/PNG/WEBP'))
  },
  limits: { fileSize: 5 * 1024 * 1024 },
})

// POST /api/uploads/producto/:id
router.post('/producto/:id', upload.single('imagen'), async (req, res) => {
  try {
    const producto = await Producto.findByPk(req.params.id)
    if (!producto) return res.status(404).json({ error: 'Producto no encontrado' })
    if (!req.file)  return res.status(400).json({ error: 'Sin archivo' })

    // Subir a Cloudinary
    const resultado = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { folder: 'ceketo/productos', public_id: `prod_${req.params.id}`, overwrite: true },
        (err, result) => err ? reject(err) : resolve(result)
      ).end(req.file.buffer)
    })

    await producto.update({ imagen: resultado.secure_url })
    res.json({ ok: true, imagen: resultado.secure_url })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
