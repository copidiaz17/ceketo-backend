import { DataTypes } from 'sequelize'
import { sequelize } from '../database.js'
import Venta from './Venta.js'
import Producto from './Producto.js'

const VentaItem = sequelize.define('VentaItem', {
  id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  venta_id:    { type: DataTypes.INTEGER, references: { model: Venta,    key: 'id' } },
  producto_id: { type: DataTypes.INTEGER, references: { model: Producto, key: 'id' } },
  cantidad:    { type: DataTypes.INTEGER, allowNull: false },
  precio_unit: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  subtotal:    { type: DataTypes.DECIMAL(10, 2), allowNull: false },
}, { tableName: 'venta_items', timestamps: false })

VentaItem.belongsTo(Venta,    { foreignKey: 'venta_id',    as: 'venta' })
VentaItem.belongsTo(Producto, { foreignKey: 'producto_id', as: 'producto' })
Venta.hasMany(VentaItem,      { foreignKey: 'venta_id',    as: 'items' })
Producto.hasMany(VentaItem,   { foreignKey: 'producto_id', as: 'venta_items' })

export default VentaItem
