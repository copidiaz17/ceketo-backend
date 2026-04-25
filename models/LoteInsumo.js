import { DataTypes } from 'sequelize'
import { sequelize } from '../database.js'
import Insumo from './Insumo.js'

const LoteInsumo = sequelize.define('LoteInsumo', {
  id:             { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  lote_id:        { type: DataTypes.STRING(36), allowNull: false },
  insumo_id:      { type: DataTypes.INTEGER, allowNull: false, references: { model: Insumo, key: 'id' } },
  cantidad:       { type: DataTypes.DECIMAL(12, 3), allowNull: false },
  costo_unitario: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
}, { tableName: 'lote_insumos', timestamps: false })

LoteInsumo.belongsTo(Insumo, { foreignKey: 'insumo_id', as: 'insumo' })
Insumo.hasMany(LoteInsumo,   { foreignKey: 'insumo_id' })

export default LoteInsumo
