import express from 'express'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import dotenv from 'dotenv'
dotenv.config()

if (!process.env.JWT_SECRET) {
  console.error('✗ JWT_SECRET no definido. El servidor no puede arrancar de forma segura.')
  process.exit(1)
}

import { sequelize } from './database.js'

// Modelos
import './models/Categoria.js'
import './models/Producto.js'
import './models/Produccion.js'
import './models/Venta.js'
import './models/VentaItem.js'
import './models/Pedido.js'
import './models/PedidoItem.js'
import './models/Gasto.js'
import Usuario from './models/Usuario.js'

// Rutas
import productosRouter   from './routes/productos.js'
import categoriasRouter  from './routes/categorias.js'
import produccionRouter  from './routes/produccion.js'
import ventasRouter      from './routes/ventas.js'
import authRouter        from './routes/auth.js'
import adminRouter       from './routes/admin.js'
import pedidosRouter     from './routes/pedidos.js'
import uploadsRouter     from './routes/uploads.js'
import gastosRouter      from './routes/gastos.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3000

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : true   // true = cualquier origen (solo en desarrollo)

app.set('trust proxy', 1)
app.use(cors({ origin: allowedOrigins, credentials: true }))
app.use(express.json())

// Archivos subidos (persistentes)
app.use('/uploads', express.static(join(__dirname, 'public/uploads')))

// Rate limit global para API (100 req/min por IP)
app.use('/api', rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas peticiones. Intentá en un minuto.' },
}))

// API
app.use('/api/productos',  productosRouter)
app.use('/api/categorias', categoriasRouter)
app.use('/api/produccion', produccionRouter)
app.use('/api/ventas',     ventasRouter)
app.use('/api/auth',       authRouter)
app.use('/api/admin',      adminRouter)
app.use('/api/pedidos',    pedidosRouter)
app.use('/api/uploads',    uploadsRouter)
app.use('/api/gastos',     gastosRouter)

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'CEKETO API running 🥑' })
})

// Conectar a MySQL y arrancar
async function start() {
  try {
    await sequelize.authenticate()
    console.log('✓ MySQL conectado')
    await sequelize.sync({ force: false })
    console.log('✓ Tablas sincronizadas')

    app.listen(PORT, () => {
      console.log(`🚀 CEKETO Backend corriendo en http://localhost:${PORT}`)
    })
  } catch (err) {
    console.error('✗ Error al iniciar:', err.message)
    process.exit(1)
  }
}

start()
