import express from 'express'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import bcrypt from 'bcryptjs'
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
import './models/CuentaCorriente.js'
import './models/MovimientoCuenta.js'
import './models/Caja.js'
import './models/MovimientoCaja.js'
import './models/AjusteStock.js'
import './models/Proveedor.js'
import './models/Insumo.js'
import './models/LoteInsumo.js'
import './models/LoteHoras.js'
import Usuario from './models/Usuario.js'
import Insumo  from './models/Insumo.js'

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
import cuentasRouter     from './routes/cuentas.js'
import cajaRouter          from './routes/caja.js'
import proveedoresRouter   from './routes/proveedores.js'
import reportesRouter      from './routes/reportes.js'
import insumosRouter       from './routes/insumos.js'
import loteCostosRouter    from './routes/loteCostos.js'
import usuariosRouter      from './routes/usuarios.js'
import { candadoPorRol } from './middleware/roles.js'

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

// Cada rol solo llega a lo que su pantalla usa (ver middleware/roles.js).
// Va ANTES de las rutas para que no dependa de que el menú lo esconda.
app.use('/api', candadoPorRol)

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
app.use('/api/cuentas',   cuentasRouter)
app.use('/api/caja',        cajaRouter)
app.use('/api/proveedores', proveedoresRouter)
app.use('/api/admin/reportes', reportesRouter)
app.use('/api/insumos',       insumosRouter)
app.use('/api/lote-costos',   loteCostosRouter)
app.use('/api/usuarios',      usuariosRouter)

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'CEKETO API running 🥑' })
})

// Conectar a MySQL y arrancar
async function start() {
  try {
    await sequelize.authenticate()
    console.log('✓ MySQL conectado')
    await sequelize.sync()
    console.log('✓ Tablas sincronizadas')

    // Migraciones manuales: agregar columnas/tablas nuevas sin alter
    try {
      await sequelize.query(`
        ALTER TABLE movimientos_caja
        ADD COLUMN medio ENUM('efectivo','billetera') NOT NULL DEFAULT 'efectivo'
      `)
      console.log('✓ Columna medio agregada a movimientos_caja')
    } catch (e) {
      if (e.original?.code === 'ER_DUP_FIELDNAME') {
        console.log('✓ Columna medio ya existe')
      } else {
        console.warn('⚠ medio:', e.message)
      }
    }

    try {
      await sequelize.query(`
        ALTER TABLE movimientos_caja
        ADD COLUMN fecha DATE NOT NULL DEFAULT (CURDATE())
      `)
      console.log('✓ Columna fecha agregada a movimientos_caja')
    } catch (e) {
      if (e.original?.code === 'ER_DUP_FIELDNAME') {
        console.log('✓ Columna fecha ya existe en movimientos_caja')
      } else {
        console.warn('⚠ fecha movimientos_caja:', e.message)
      }
    }

    try {
      await sequelize.query(`
        ALTER TABLE ventas
        ADD COLUMN costo_envio DECIMAL(10,2) NOT NULL DEFAULT 0
      `)
      console.log('✓ Columna costo_envio agregada a ventas')
    } catch (e) {
      if (e.original?.code === 'ER_DUP_FIELDNAME') {
        console.log('✓ Columna costo_envio ya existe')
      } else {
        console.warn('⚠ costo_envio:', e.message)
      }
    }

    try {
      await sequelize.query(`
        ALTER TABLE pedidos
        ADD COLUMN tipo_entrega ENUM('retiro','envio') NOT NULL DEFAULT 'retiro'
      `)
      console.log('✓ Columna tipo_entrega agregada a pedidos')
    } catch (e) {
      if (e.original?.code === 'ER_DUP_FIELDNAME') {
        console.log('✓ Columna tipo_entrega ya existe')
      } else {
        console.warn('⚠ tipo_entrega:', e.message)
      }
    }

    try {
      await sequelize.query(`
        ALTER TABLE pedidos
        ADD COLUMN venta_id INT NULL
      `)
      console.log('✓ Columna venta_id agregada a pedidos')
    } catch (e) {
      if (e.original?.code === 'ER_DUP_FIELDNAME') {
        console.log('✓ Columna venta_id ya existe')
      } else {
        console.warn('⚠ venta_id pedidos:', e.message)
      }
    }

    // Rol 'contenido' para la community manager. sync() no toca los ENUM,
    // así que hay que ampliarlo a mano. Es idempotente: repetirlo no rompe nada.
    try {
      await sequelize.query(`
        ALTER TABLE usuarios
        MODIFY COLUMN rol ENUM('admin','fabrica','ventas','contenido')
        NOT NULL DEFAULT 'fabrica'
      `)
      console.log('✓ Rol contenido disponible')
    } catch (e) {
      console.warn('⚠ rol contenido:', e.message)
    }

    // Seed de insumos base (solo si no existen por nombre)
    const insumosBase = [
      { nombre: 'Harina de almendras y semillas de Damasco', unidad: 'kg' },
      { nombre: 'Harina de almendras pura',                  unidad: 'kg' },
      { nombre: 'Levadura',                                   unidad: 'kg' },
      { nombre: 'Grasa',                                      unidad: 'kg' },
      { nombre: 'Harina de semillas',                         unidad: 'kg' },
      { nombre: 'Manteca',                                    unidad: 'kg' },
      { nombre: 'Aceite de oliva',                            unidad: 'litro' },
      { nombre: 'Moon de pan',                                unidad: 'unidad' },
      { nombre: 'Molde de budín',                             unidad: 'unidad' },
    ]
    let insumosCreados = 0
    for (const ins of insumosBase) {
      const existe = await Insumo.findOne({ where: { nombre: ins.nombre } })
      if (!existe) {
        await Insumo.create({ ...ins, costo_unitario: 0, activo: true })
        insumosCreados++
      }
    }
    if (insumosCreados > 0) console.log(`✓ ${insumosCreados} insumo(s) base creados`)
    else console.log('✓ Insumos base ya existentes')

    // Seed: usuario admin copidiaz17@gmail.com (solo crea si no existe)
    const existeCopi = await Usuario.findOne({ where: { usuario: 'copidiaz17@gmail.com' } })
    if (!existeCopi) {
      await Usuario.create({
        usuario: 'copidiaz17@gmail.com',
        password: await bcrypt.hash('Martina2013', 10),
        rol: 'admin',
        activo: true,
      })
      console.log('✓ Usuario copidiaz17@gmail.com creado')
    }

    app.listen(PORT, () => {
      console.log(`🚀 CEKETO Backend corriendo en http://localhost:${PORT}`)
    })
  } catch (err) {
    console.error('✗ Error al iniciar:', err.message)
    process.exit(1)
  }
}

// Heartbeat: cada 4 minutos ejecuta un SELECT 1 para mantener la conexión viva en Aiven
setInterval(async () => {
  try {
    await sequelize.query('SELECT 1')
  } catch (err) {
    console.warn('Heartbeat DB falló, reconectando...', err.message)
  }
}, 4 * 60 * 1000)

start()
