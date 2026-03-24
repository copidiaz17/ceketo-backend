import { Router } from 'express'
import jwt from 'jsonwebtoken'
import rateLimit from 'express-rate-limit'

const router = Router()

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de login. Intentá en 15 minutos.' },
})

const USERS = [
  {
    usuario:  process.env.ADMIN_USER         || 'admin',
    password: process.env.ADMIN_PASS         || 'ceketo2024',
    rol:      'admin',
  },
  {
    usuario:  process.env.FABRICA_USER       || 'fabrica',
    password: process.env.FABRICA_PASS       || 'fabrica2024',
    rol:      'fabrica',
  },
]

// POST /api/auth/login
router.post('/login', loginLimiter, (req, res) => {
  const { usuario, password } = req.body
  const user = USERS.find(u => u.usuario === usuario && u.password === password)
  if (!user) return res.status(401).json({ error: 'Credenciales incorrectas' })
  const token = jwt.sign({ usuario: user.usuario, rol: user.rol }, process.env.JWT_SECRET, { expiresIn: '8h' })
  res.json({ token, usuario: user.usuario, rol: user.rol })
})

// Middleware de autenticación exportado para usar en otras rutas si se necesita
export function requireAuth(req, res, next) {
  const auth = req.headers.authorization
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'No autorizado' })
  try {
    const payload = jwt.verify(auth.slice(7), process.env.JWT_SECRET)
    req.admin = payload
    next()
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' })
  }
}

export default router
