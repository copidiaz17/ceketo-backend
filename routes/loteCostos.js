import { Router } from 'express'
import { sequelize } from '../database.js'
import LoteInsumo from '../models/LoteInsumo.js'
import LoteHoras from '../models/LoteHoras.js'
import Insumo from '../models/Insumo.js'
import MovimientoInsumo from '../models/MovimientoInsumo.js'
import { requireAuth } from './auth.js'

const router = Router()
router.use(requireAuth)

// GET /api/lote-costos/:lote_id — trae horas e insumos del lote
router.get('/:lote_id', async (req, res) => {
  try {
    const { lote_id } = req.params
    const [horas, insumos] = await Promise.all([
      LoteHoras.findOne({ where: { lote_id } }),
      LoteInsumo.findAll({
        where: { lote_id },
        include: [{ model: Insumo, as: 'insumo', attributes: ['nombre', 'unidad'] }],
        order: [['id', 'ASC']],
      }),
    ])
    res.json({ horas: horas || null, insumos })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/lote-costos/:lote_id — guarda/reemplaza horas e insumos de un lote ya cargado (pestaña "Costos")
router.post('/:lote_id', async (req, res) => {
  const t = await sequelize.transaction()
  try {
    await guardarCostosLote(req.params.lote_id, req.body, req.admin?.usuario, t)
    await t.commit()
    res.json({ ok: true })
  } catch (err) {
    await t.rollback()
    res.status(500).json({ error: err.message })
  }
})

// Guarda horas e insumos de un lote dentro de la transacción `t`.
// La usa también POST /api/produccion, para que productos + horas + insumos se graben juntos o nada.
export async function guardarCostosLote(lote_id, { horas, costo_hora, insumos } = {}, usuario, t) {
  // Horas: upsert
  if (horas != null && costo_hora != null) {
    await LoteHoras.upsert(
      { lote_id, horas: parseFloat(horas) || 0, costo_hora: parseFloat(costo_hora) || 0 },
      { transaction: t }
    )
  }

  // Insumos: borrar los anteriores y volver a insertar.
  // El stock de cada insumo se mueve por la DIFERENCIA entre lo que había cargado y lo nuevo
  // (los renglones viejos, de antes del control de stock, no se habían descontado: no se devuelven).
  if (Array.isArray(insumos)) {
    const antes = {}
    for (const li of await LoteInsumo.findAll({ where: { lote_id, descontado: true }, transaction: t })) {
      antes[li.insumo_id] = (antes[li.insumo_id] || 0) + Number(li.cantidad)
    }
    await LoteInsumo.destroy({ where: { lote_id }, transaction: t })
    const ahora = {}
    for (const ins of insumos) {
      if (!ins.insumo_id || !ins.cantidad) continue
      const cant = Number(ins.cantidad)
      if (!(cant > 0)) throw new Error('Cantidad de insumo inválida: tiene que ser un número mayor a 0')
      if (!(await Insumo.findByPk(ins.insumo_id, { transaction: t }))) throw new Error('Insumo no encontrado')
      await LoteInsumo.create({
        lote_id,
        insumo_id:      ins.insumo_id,
        cantidad:       parseFloat(ins.cantidad),
        costo_unitario: parseFloat(ins.costo_unitario) || 0,
        descontado:     true,
      }, { transaction: t })
      ahora[ins.insumo_id] = (ahora[ins.insumo_id] || 0) + parseFloat(ins.cantidad)
    }
    await moverStockInsumos(antes, ahora, `Lote ${String(lote_id).slice(0, 8)}`, usuario, t)
  }
}

// Ajusta el stock de los insumos: devuelve lo de "antes" y descuenta lo de "ahora" (solo la diferencia)
export async function moverStockInsumos(antes, ahora, referencia, usuario, t) {
  for (const id of new Set([...Object.keys(antes), ...Object.keys(ahora)])) {
    const dif = Math.round(((antes[id] || 0) - (ahora[id] || 0)) * 1000) / 1000   // + vuelve al stock, − sale
    if (!dif) continue
    const insumo = await Insumo.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE })
    if (!insumo) continue
    const stock = Math.round((Number(insumo.stock) + dif) * 1000) / 1000
    await insumo.update({ stock }, { transaction: t })
    await MovimientoInsumo.create({ insumo_id: insumo.id, tipo: 'produccion', cantidad: dif, stock_resultante: stock, referencia, usuario: usuario || null }, { transaction: t })
  }
}

export default router
