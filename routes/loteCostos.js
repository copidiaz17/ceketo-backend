import { Router } from 'express'
import { sequelize } from '../database.js'
import LoteInsumo from '../models/LoteInsumo.js'
import LoteHoras from '../models/LoteHoras.js'
import Insumo from '../models/Insumo.js'
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

// POST /api/lote-costos/:lote_id — guarda/reemplaza horas e insumos del lote
router.post('/:lote_id', async (req, res) => {
  const t = await sequelize.transaction()
  try {
    const { lote_id } = req.params
    const { horas, costo_hora, insumos } = req.body

    // Horas: upsert
    if (horas != null && costo_hora != null) {
      await LoteHoras.upsert(
        { lote_id, horas: parseFloat(horas) || 0, costo_hora: parseFloat(costo_hora) || 0 },
        { transaction: t }
      )
    }

    // Insumos: borrar los anteriores y volver a insertar
    if (Array.isArray(insumos)) {
      await LoteInsumo.destroy({ where: { lote_id }, transaction: t })
      for (const ins of insumos) {
        if (!ins.insumo_id || !ins.cantidad) continue
        await LoteInsumo.create({
          lote_id,
          insumo_id:      ins.insumo_id,
          cantidad:       parseFloat(ins.cantidad),
          costo_unitario: parseFloat(ins.costo_unitario) || 0,
        }, { transaction: t })
      }
    }

    await t.commit()
    res.json({ ok: true })
  } catch (err) {
    await t.rollback()
    res.status(500).json({ error: err.message })
  }
})

export default router
