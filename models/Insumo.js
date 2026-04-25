import { DataTypes } from 'sequelize'
import { sequelize } from '../database.js'

const Insumo = sequelize.define('Insumo', {
  id:             { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  nombre:         { type: DataTypes.STRING(200), allowNull: false },
  unidad:         { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'unidad' },
  costo_unitario: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  activo:         { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, { tableName: 'insumos', timestamps: false })

export default Insumo
