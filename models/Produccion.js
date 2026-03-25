import { DataTypes } from 'sequelize'
import { sequelize } from '../database.js'
import Producto from './Producto.js'

const Produccion = sequelize.define('Produccion', {
  id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  lote_id:     { type: DataTypes.STRING(36), allowNull: true },
  producto_id: { type: DataTypes.INTEGER, references: { model: Producto, key: 'id' } },
  cantidad:    { type: DataTypes.INTEGER, allowNull: false },
  fecha:       { type: DataTypes.DATEONLY, allowNull: false, defaultValue: DataTypes.NOW },
  nota:        { type: DataTypes.STRING(500) },
}, { tableName: 'produccion', timestamps: false })

Produccion.belongsTo(Producto, { foreignKey: 'producto_id', as: 'producto' })
Producto.hasMany(Produccion,   { foreignKey: 'producto_id', as: 'producciones' })

export default Produccion
