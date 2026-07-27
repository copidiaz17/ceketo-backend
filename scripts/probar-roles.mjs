// Verifica el candado por rol.  ->  node backend/scripts/probar-roles.mjs
// Las rutas "SÍ puede" salieron de leer las llamadas a la API de cada pantalla.
// No necesita base de datos.
import jwt from 'jsonwebtoken'
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prueba'
const { candadoPorRol } = await import('../middleware/roles.js')

const token = (rol) => 'Bearer ' + jwt.sign({ usuario: 'x', rol }, process.env.JWT_SECRET)

function probar(rol, metodo, ruta) {
  const req = { headers: rol ? { authorization: token(rol) } : {}, method: metodo, path: ruta }
  let r = 'pasa'
  const res = { status: (c) => ({ json: () => { r = c } }) }
  candadoPorRol(req, res, () => { r = 'pasa' })
  return r
}

let fallos = 0
const chequear = (rol, met, ruta, esperado, desc) => {
  const real = probar(rol, met, ruta)
  const ok = real === esperado
  if (!ok) fallos++
  console.log(`  ${ok ? '✅' : '✖'} ${desc}${ok ? '' : `   (dio ${real}, esperaba ${esperado})`}`)
}

// Lo que cada pantalla llama de verdad → tiene que pasar
const NECESITA = {
  contenido: [
    ['GET', '/productos', 'ver los productos'],
    ['GET', '/productos/12', 'abrir un producto'],
    ['POST', '/productos', 'crear un producto'],
    ['PUT', '/productos/12', 'editar un producto'],
    ['DELETE', '/productos/12', 'borrar un producto'],
    ['POST', '/uploads/producto/12', 'subir una foto'],
    ['GET', '/categorias', 'ver las categorías'],
  ],
  fabrica: [
    ['GET', '/produccion/lotes', 'ver los lotes'],
    ['POST', '/produccion', 'cargar producción'],
    ['DELETE', '/produccion/lote/8', 'eliminar un lote'],
    ['GET', '/lote-costos/8', 'ver el costo de un lote'],
    ['POST', '/lote-costos/8', 'cargar el costo de un lote'],
    ['GET', '/insumos', 'ver los insumos'],
    ['GET', '/productos', 'ver los productos'],
    ['GET', '/productos/12/ajustes', 'ver ajustes de stock'],
    ['PUT', '/productos/12/ajuste-stock', 'ajustar el stock'],
  ],
  ventas: [
    ['GET', '/ventas', 'ver las ventas'],
    ['POST', '/ventas', 'registrar una venta'],
    ['PATCH', '/ventas/33', 'editar una venta'],
    ['DELETE', '/ventas/33', 'anular una venta'],
    ['GET', '/cuentas', 'ver cuentas corrientes'],
    ['POST', '/cuentas', 'crear una cuenta'],
    ['POST', '/cuentas/4/movimientos', 'cargar un movimiento'],
    ['DELETE', '/cuentas/4/movimientos/9', 'borrar un movimiento'],
    ['GET', '/pedidos', 'ver pedidos online'],
    ['PATCH', '/pedidos/7/estado', 'aceptar o rechazar un pedido'],
    ['GET', '/productos/barcode/779', 'leer un código de barras'],
    ['PUT', '/productos/12/ajuste-stock', 'ajustar el stock'],
  ],
}

// Lo que NO debe poder tocar cada rol
const PROHIBIDO = {
  contenido: [['GET', '/caja'], ['GET', '/ventas'], ['GET', '/gastos'], ['GET', '/cuentas'],
              ['GET', '/admin/reportes/ventas'], ['GET', '/pedidos'], ['GET', '/insumos'],
              ['GET', '/proveedores'], ['POST', '/produccion'], ['DELETE', '/categorias/3']],
  fabrica:   [['GET', '/caja'], ['GET', '/ventas'], ['GET', '/gastos'], ['GET', '/cuentas'],
              ['GET', '/admin/reportes/ventas'], ['GET', '/proveedores'],
              ['PUT', '/productos/12'], ['DELETE', '/productos/12'], ['POST', '/productos']],
  ventas:    [['GET', '/caja'], ['GET', '/gastos'], ['GET', '/admin/reportes/ventas'],
              ['GET', '/insumos'], ['GET', '/proveedores'], ['POST', '/produccion'],
              ['PUT', '/productos/12'], ['DELETE', '/productos/12']],
}

for (const rol of ['contenido', 'fabrica', 'ventas']) {
  console.log(`\n══ ROL ${rol.toUpperCase()} ══`)
  console.log('\n  Lo que su pantalla necesita:')
  for (const [met, ruta, desc] of NECESITA[rol]) chequear(rol, met, ruta, 'pasa', desc)
  console.log('\n  Lo que NO debe alcanzar:')
  for (const [met, ruta] of PROHIBIDO[rol]) chequear(rol, met, ruta, 403, `${met} ${ruta}`)
  console.log('\n  Configuración (su propia clave):')
  chequear(rol, 'GET', '/auth/me', 'pasa', 'ver quién es')
  chequear(rol, 'PUT', '/usuarios/9', 'pasa', 'cambiar su contraseña')
  chequear(rol, 'GET', '/admin/stock-bajo/count', 'pasa', 'el contador del menú')
}

console.log('\n══ ADMIN Y CASOS BORDE ══')
for (const [met, ruta] of [['GET', '/caja'], ['GET', '/admin/reportes/ventas'],
                           ['DELETE', '/productos/1'], ['POST', '/gastos']]) {
  chequear('admin', met, ruta, 'pasa', `admin sigue pudiendo ${met} ${ruta}`)
}
chequear(null, 'GET', '/caja', 'pasa', 'sin token, decide la ruta como antes')
chequear('rol_inventado', 'GET', '/caja', 'pasa', 'un rol desconocido no se bloquea de golpe')

console.log(fallos ? `\n✖ ${fallos} fallo(s)\n` : '\n✅ el candado funciona\n')
process.exit(fallos ? 1 : 0)
