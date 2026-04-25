import { DataTypes } from 'sequelize'
import { sequelize } from '../database.js'

const LoteHoras = sequelize.define('LoteHoras', {
  id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  lote_id:    { type: DataTypes.STRING(36), allowNull: false, unique: true },
  horas:      { type: DataTypes.DECIMAL(8, 2), allowNull: false, defaultValue: 0 },
  costo_hora: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
}, { tableName: 'lote_horas', timestamps: false })

export default LoteHoras
