import jwt from 'jsonwebtoken'

/**
 * Candado por rol.
 *
 * ⚠️ POR QUÉ EXISTE: las rutas usan `requireAuth` pero no miran el rol, así que
 * cualquier usuario logueado podía llamar a /api/caja o /api/reportes directo desde
 * el navegador aunque el menú de Vue no se lo mostrara. Esconder el menú NO alcanza.
 *
 * `admin` no tiene restricciones. Los demás roles solo llegan a lo que su pantalla
 * realmente usa — la lista salió de leer las llamadas a la API de cada vista, no
 * de suponer. Si mañana una pantalla necesita algo más, se agrega ACÁ.
 */

// Rutas que puede usar cualquiera que haya iniciado sesión
const COMUNES = [
  { metodos: ['GET'], ruta: /^\/auth\/me$/ },
  { metodos: ['GET'], ruta: /^\/admin\/stock-bajo\// },        // el contador del menú
  // La pantalla de Configuración. `usuarios.js` ya decide por su cuenta
  // que solo un admin liste o cree, y que cada uno edite lo suyo.
  { metodos: ['GET', 'POST'], ruta: /^\/usuarios$/ },
  { metodos: ['PUT'],         ruta: /^\/usuarios\/\d+$/ },
]

const PERMISOS = {
  // Community manager: Productos y nada más.
  contenido: [
    { metodos: ['GET', 'POST', 'PUT', 'DELETE'], ruta: /^\/productos(\/|$|\?)/ },
    { metodos: ['GET'],  ruta: /^\/categorias(\/|$|\?)/ },
    { metodos: ['POST'], ruta: /^\/uploads\/producto\/\d+$/ },
  ],

  // Fábrica: producción y stock.
  fabrica: [
    { metodos: ['GET'], ruta: /^\/productos(\/|$|\?)/ },
    { metodos: ['PUT'], ruta: /^\/productos\/\d+\/(ajuste-stock|stock)$/ },
    { metodos: ['GET'], ruta: /^\/categorias(\/|$|\?)/ },
    { metodos: ['GET', 'POST', 'PUT', 'DELETE'], ruta: /^\/produccion(\/|$|\?)/ },
    { metodos: ['GET', 'POST'], ruta: /^\/lote-costos\/\d+$/ },
    { metodos: ['GET'], ruta: /^\/insumos(\/|$|\?)/ },
  ],

  // Ventas: mostrador, cuentas corrientes y stock.
  ventas: [
    { metodos: ['GET'], ruta: /^\/productos(\/|$|\?)/ },
    { metodos: ['PUT'], ruta: /^\/productos\/\d+\/(ajuste-stock|stock)$/ },
    { metodos: ['GET'], ruta: /^\/categorias(\/|$|\?)/ },
    { metodos: ['GET', 'POST', 'PATCH', 'DELETE'], ruta: /^\/ventas(\/|$|\?)/ },
    { metodos: ['GET', 'POST', 'PUT', 'DELETE'],   ruta: /^\/cuentas(\/|$|\?)/ },
    { metodos: ['GET', 'PATCH'], ruta: /^\/pedidos(\/|$|\?)/ },
  ],
}

export function candadoPorRol(req, res, next) {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) return next()   // sin token: que decida cada ruta

  let payload
  try {
    payload = jwt.verify(auth.slice(7), process.env.JWT_SECRET)
  } catch {
    return next()   // token inválido: lo rechaza requireAuth con su propio mensaje
  }

  const permitido = PERMISOS[payload.rol]
  if (!permitido) return next()   // admin, o un rol que todavía no limitamos

  const ruta = req.path   // sin el /api, porque el middleware va montado ahí
  const puede = [...COMUNES, ...permitido]
    .some(p => p.metodos.includes(req.method) && p.ruta.test(ruta))

  if (puede) return next()
  return res.status(403).json({ error: 'Tu usuario no tiene acceso a esta sección' })
}

// Nombre viejo, por si quedó alguna importación
export const candadoContenido = candadoPorRol
export default candadoPorRol
