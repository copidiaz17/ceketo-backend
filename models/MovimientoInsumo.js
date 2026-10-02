import { DataTypes } from 'sequelize'
import { sequelize } from '../database.js'
import Insumo from './Insumo.js'

// Historial del stock de cada insumo: compras (+), uso en producción (−), ajustes por conteo y anulaciones
const MovimientoInsumo = sequelize.define('MovimientoInsumo', {
  id:               { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  insumo_id:        { type: DataTypes.INTEGER, allowNull: false, references: { model: Insumo, key: 'id' } },
  fecha:            { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  tipo:             { type: DataTypes.ENUM('compra', 'produccion', 'ajuste', 'anulacion'), allowNull: false },
  cantidad:         { type: DataTypes.DECIMAL(12, 3), allowNull: false },   // + entra, − sale
  stock_resultante: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
  referencia:       { type: DataTypes.STRING(120), allowNull: true },       // "Compra #12", "Lote 9da68897"
  usuario:          { type: DataTypes.STRING(100), allowNull: true },
}, { tableName: 'movimientos_insumo', timestamps: false })

MovimientoInsumo.belongsTo(Insumo, { foreignKey: 'insumo_id', as: 'insumo' })
Insumo.hasMany(MovimientoInsumo, { foreignKey: 'insumo_id', as: 'movimientos' })

export default MovimientoInsumo
