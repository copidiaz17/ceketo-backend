import 'dotenv/config'
import { readdir, readFile } from 'fs/promises'
import { join, extname, basename } from 'path'
import { v2 as cloudinary } from 'cloudinary'
import { sequelize } from './database.js'
import Producto from './models/Producto.js'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

const CARPETA = 'C:\\Users\\Usuario\\Desktop\\imagenes ceketo'

// Mapeo manual para nombres de archivo que no coinciden exactamente con la DB
const MANUAL_MAP = {
  'Budin de coco y dulce de leche': 7,
  'Budin de arandanos':             2,
  'pan de campo':                   51,
  'Pan de lomito':                  54,
  'Pepas de membrillo':             34,
  'alfajor oreo':                   40,
  'Bizcochitos':                    43,
  'Budin de nuez':                  4,
  'Cono relleno de dulce de leche': 30,
  'Cookie chip de chocolate':       21,
  'Cookie de chocolate':            21,
  'Crackers':                       44,
  'Facturas de membrillo':          22,
  'focaccia':                       47,
  'masa de tacos':                  45,
  'Medialunas dulces':              24,
  'Pan blanco':                     53,
  'Pan de hamburguesas':            55,
  'pizzetas':                       56,
  'waffles':                        32,
  'Papas de dulce de leche':        25,
}

function normalizar(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
}

async function main() {
  await sequelize.authenticate()
  console.log('✓ DB conectada')

  const productos = await Producto.findAll({ attributes: ['id', 'nombre', 'imagen'] })
  const archivos  = (await readdir(CARPETA)).filter(f => /\.(jpe?g|png|webp)$/i.test(f))

  console.log(`\nProductos en DB: ${productos.length}`)
  console.log(`Archivos de imagen: ${archivos.length}\n`)

  let actualizados = 0
  let sinMatch     = []

  for (const archivo of archivos) {
    const nombreArchivo = normalizar(basename(archivo, extname(archivo)))

    // Buscar en el mapeo manual primero
    const nombreOriginal = basename(archivo, extname(archivo))
    const idManual = MANUAL_MAP[nombreOriginal]
    if (idManual) {
      const prodManual = productos.find(p => p.id === idManual)
      if (prodManual) {
        try {
          const buffer = await readFile(join(CARPETA, archivo))
          const resultado = await new Promise((resolve, reject) => {
            cloudinary.uploader.upload_stream(
              { folder: 'ceketo/productos', public_id: `prod_${prodManual.id}`, overwrite: true },
              (err, result) => err ? reject(err) : resolve(result)
            ).end(buffer)
          })
          await prodManual.update({ imagen: resultado.secure_url })
          console.log(`✓ [${prodManual.id}] ${prodManual.nombre}  →  ${archivo}  (manual)`)
          actualizados++
        } catch (err) {
          console.error(`✗ Error subiendo ${archivo}: ${err.message}`)
        }
        continue
      }
    }

    const producto = productos.find(p => {
      const nombreProd = normalizar(p.nombre)
      if (nombreProd === nombreArchivo) return true
      // Solo usar includes si el término buscado tiene al menos 6 chars (evita falsos como "Té")
      if (nombreProd.length >= 6 && nombreArchivo.includes(nombreProd)) return true
      if (nombreArchivo.length >= 6 && nombreProd.includes(nombreArchivo)) return true
      return false
    })

    if (!producto) {
      sinMatch.push(archivo)
      continue
    }

    try {
      const buffer = await readFile(join(CARPETA, archivo))

      const resultado = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          { folder: 'ceketo/productos', public_id: `prod_${producto.id}`, overwrite: true },
          (err, result) => err ? reject(err) : resolve(result)
        ).end(buffer)
      })

      await producto.update({ imagen: resultado.secure_url })
      console.log(`✓ [${producto.id}] ${producto.nombre}  →  ${archivo}`)
      actualizados++
    } catch (err) {
      console.error(`✗ Error subiendo ${archivo}: ${err.message}`)
    }
  }

  console.log(`\n── Resumen ──`)
  console.log(`✓ Actualizados: ${actualizados}`)
  if (sinMatch.length) {
    console.log(`\n⚠ Sin match en DB (${sinMatch.length}) — sugerencias:`)
    for (const f of sinMatch) {
      const nombreArchivo = normalizar(basename(f, extname(f)))
      const palabras = nombreArchivo.split(' ').filter(p => p.length >= 4)
      const sugeridos = productos
        .filter(p => palabras.some(pal => normalizar(p.nombre).includes(pal)))
        .map(p => `${p.id}: ${p.nombre}`)
        .slice(0, 3)
      console.log(`\n   "${f}"`)
      if (sugeridos.length) sugeridos.forEach(s => console.log(`      → ${s}`))
      else console.log(`      → sin sugerencias`)
    }
  }

  await sequelize.close()
}

main().catch(err => { console.error(err); process.exit(1) })
