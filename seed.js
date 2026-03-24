import { sequelize } from './database.js'
import Categoria from './models/Categoria.js'
import Producto from './models/Producto.js'
// importar los demás modelos para que se sincronicen sus tablas
import './models/Produccion.js'
import './models/Venta.js'
import './models/VentaItem.js'

const categorias = [
  { codigo: 'BYM', nombre: 'Budines y Muffins' },
  { codigo: 'CHC', nombre: 'Chocolates' },
  { codigo: 'DUL', nombre: 'Dulces' },
  { codigo: 'PY0', nombre: 'Panes y Otros' },
  { codigo: 'PAS', nombre: 'Pastas' },
  { codigo: 'PYT', nombre: 'Postres y Tartas' },
]

const productos = [
  // BYM - Budines y Muffins
  { codigo: 'BYM-001', nombre: 'Budín de Limón',                  categoria: 'BYM', precio: 1200 },
  { codigo: 'BYM-002', nombre: 'Budín de Naranja',                categoria: 'BYM', precio: 1200 },
  { codigo: 'BYM-003', nombre: 'Budín de Vainilla',               categoria: 'BYM', precio: 1200 },
  { codigo: 'BYM-004', nombre: 'Budín de Chocolate',              categoria: 'BYM', precio: 1300 },
  { codigo: 'BYM-005', nombre: 'Budín Marmolado',                 categoria: 'BYM', precio: 1300 },
  { codigo: 'BYM-006', nombre: 'Budín de Zanahoria',              categoria: 'BYM', precio: 1300 },
  { codigo: 'BYM-007', nombre: 'Budín de Banana',                 categoria: 'BYM', precio: 1200 },
  { codigo: 'BYM-008', nombre: 'Muffin de Arándanos',             categoria: 'BYM', precio: 800 },
  { codigo: 'BYM-009', nombre: 'Muffin de Chocolate',             categoria: 'BYM', precio: 800 },
  { codigo: 'BYM-010', nombre: 'Muffin de Vainilla',              categoria: 'BYM', precio: 800 },
  { codigo: 'BYM-011', nombre: 'Muffin de Limón y Amapola',       categoria: 'BYM', precio: 850 },
  { codigo: 'BYM-012', nombre: 'Budín de Coco',                   categoria: 'BYM', precio: 1200 },
  { codigo: 'BYM-013', nombre: 'Budín Integral de Avena',         categoria: 'BYM', precio: 1100 },

  // CHC - Chocolates
  { codigo: 'CHC-001', nombre: 'Chocolate Negro 85%',             categoria: 'CHC', precio: 1500 },
  { codigo: 'CHC-002', nombre: 'Chocolate con Almendras',         categoria: 'CHC', precio: 1600 },

  // DUL - Dulces
  { codigo: 'DUL-001', nombre: 'Mermelada de Frutilla',           categoria: 'DUL', precio: 900 },
  { codigo: 'DUL-002', nombre: 'Mermelada de Durazno',            categoria: 'DUL', precio: 900 },
  { codigo: 'DUL-003', nombre: 'Mermelada de Frambuesa',          categoria: 'DUL', precio: 950 },
  { codigo: 'DUL-004', nombre: 'Mermelada de Ciruela',            categoria: 'DUL', precio: 900 },
  { codigo: 'DUL-005', nombre: 'Mermelada de Arándanos',          categoria: 'DUL', precio: 1000 },
  { codigo: 'DUL-006', nombre: 'Dulce de Leche Keto',             categoria: 'DUL', precio: 1100 },
  { codigo: 'DUL-007', nombre: 'Pasta de Maní sin Azúcar',        categoria: 'DUL', precio: 1200 },
  { codigo: 'DUL-008', nombre: 'Crema de Avellanas Keto',         categoria: 'DUL', precio: 1400 },
  { codigo: 'DUL-009', nombre: 'Mermelada de Naranja',            categoria: 'DUL', precio: 900 },
  { codigo: 'DUL-010', nombre: 'Mermelada de Manzana y Canela',   categoria: 'DUL', precio: 950 },

  // PY0 - Panes y Otros
  { codigo: 'PY0-001', nombre: 'Pan de Molde Keto',               categoria: 'PY0', precio: 1500 },
  { codigo: 'PY0-002', nombre: 'Pan de Hamburguesa Keto',         categoria: 'PY0', precio: 800 },
  { codigo: 'PY0-003', nombre: 'Pan de Hot Dog Keto',             categoria: 'PY0', precio: 800 },
  { codigo: 'PY0-004', nombre: 'Baguette Keto',                   categoria: 'PY0', precio: 900 },
  { codigo: 'PY0-005', nombre: 'Focaccia Keto',                   categoria: 'PY0', precio: 1100 },
  { codigo: 'PY0-006', nombre: 'Pan de Campo Keto',               categoria: 'PY0', precio: 1400 },
  { codigo: 'PY0-007', nombre: 'Galletitas de Avena y Coco',      categoria: 'PY0', precio: 700 },
  { codigo: 'PY0-008', nombre: 'Galletitas de Semillas',          categoria: 'PY0', precio: 700 },
  { codigo: 'PY0-009', nombre: 'Galletitas de Almendras',         categoria: 'PY0', precio: 750 },
  { codigo: 'PY0-010', nombre: 'Galletitas de Cacao',             categoria: 'PY0', precio: 750 },
  { codigo: 'PY0-011', nombre: 'Tostadas Keto',                   categoria: 'PY0', precio: 650 },
  { codigo: 'PY0-012', nombre: 'Crackers de Semillas',            categoria: 'PY0', precio: 700 },
  { codigo: 'PY0-013', nombre: 'Wraps Keto',                      categoria: 'PY0', precio: 900 },
  { codigo: 'PY0-014', nombre: 'Pizza Base Keto',                 categoria: 'PY0', precio: 1200 },
  { codigo: 'PY0-015', nombre: 'Scones Keto',                     categoria: 'PY0', precio: 600 },
  { codigo: 'PY0-016', nombre: 'Pan de Brioche Keto',             categoria: 'PY0', precio: 1600 },
  { codigo: 'PY0-017', nombre: 'Medialunas Keto',                 categoria: 'PY0', precio: 600 },
  { codigo: 'PY0-018', nombre: 'Pan con Aceitunas',               categoria: 'PY0', precio: 1300 },
  { codigo: 'PY0-019', nombre: 'Pan de Ajo Keto',                 categoria: 'PY0', precio: 950 },
  { codigo: 'PY0-020', nombre: 'Pan Integral Multicereales',      categoria: 'PY0', precio: 1500 },
  { codigo: 'PY0-021', nombre: 'Palitos Salados Keto',            categoria: 'PY0', precio: 650 },
  { codigo: 'PY0-022', nombre: 'Mini Panes de Queso',             categoria: 'PY0', precio: 700 },
  { codigo: 'PY0-023', nombre: 'Pan de Remolacha Keto',           categoria: 'PY0', precio: 1300 },

  // PAS - Pastas
  { codigo: 'PAS-001', nombre: 'Fideos Keto (Konjac)',            categoria: 'PAS', precio: 1100 },
  { codigo: 'PAS-002', nombre: 'Ñoquis Keto de Calabaza',         categoria: 'PAS', precio: 1200 },

  // PYT - Postres y Tartas
  { codigo: 'PYT-001', nombre: 'Cheesecake de Frutilla',          categoria: 'PYT', precio: 2500 },
  { codigo: 'PYT-002', nombre: 'Cheesecake de Maracuyá',          categoria: 'PYT', precio: 2500 },
  { codigo: 'PYT-003', nombre: 'Tarta de Limón',                  categoria: 'PYT', precio: 2200 },
  { codigo: 'PYT-004', nombre: 'Tarta de Chocolate',              categoria: 'PYT', precio: 2300 },
  { codigo: 'PYT-005', nombre: 'Brownie Keto',                    categoria: 'PYT', precio: 900 },
  { codigo: 'PYT-006', nombre: 'Tiramisú Keto',                   categoria: 'PYT', precio: 2400 },
  { codigo: 'PYT-007', nombre: 'Panna Cotta Keto',                categoria: 'PYT', precio: 1000 },
  { codigo: 'PYT-008', nombre: 'Mousse de Chocolate',             categoria: 'PYT', precio: 1100 },
  { codigo: 'PYT-009', nombre: 'Flan Keto',                       categoria: 'PYT', precio: 900 },
  { codigo: 'PYT-010', nombre: 'Tarta de Nueces',                 categoria: 'PYT', precio: 2200 },
]

async function seed() {
  try {
    await sequelize.authenticate()
    console.log('✓ Conectado a MySQL')

    // Sincroniza tablas (crea si no existen)
    await sequelize.sync({ alter: true })
    console.log('✓ Tablas sincronizadas')

    // Insertar categorías
    const catMap = {}
    for (const cat of categorias) {
      const [row] = await Categoria.findOrCreate({ where: { codigo: cat.codigo }, defaults: cat })
      catMap[cat.codigo] = row.id
    }
    console.log('✓ Categorías insertadas:', Object.keys(catMap).join(', '))

    // Insertar productos
    let creados = 0, omitidos = 0
    for (const p of productos) {
      const codigoBarras = `*${p.codigo}*`
      const [, created] = await Producto.findOrCreate({
        where: { codigo: p.codigo },
        defaults: {
          nombre:        p.nombre,
          categoria_id:  catMap[p.categoria],
          codigo_barras: codigoBarras,
          precio:        p.precio,
          stock:         0,
          activo:        true,
        },
      })
      created ? creados++ : omitidos++
    }
    console.log(`✓ Productos: ${creados} creados, ${omitidos} ya existían`)
    console.log('✅ Seed completado')
  } catch (err) {
    console.error('✗ Error en seed:', err.message)
  } finally {
    await sequelize.close()
  }
}

seed()
