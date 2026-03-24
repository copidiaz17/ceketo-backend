import { DataTypes } from 'sequelize'
import { sequelize } from '../database.js'
import Pedido from './Pedido.js'
import Producto from './Producto.js'

const PedidoItem = sequelize.define('PedidoItem', {
  id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  pedido_id:   { type: DataTypes.INTEGER, references: { model: Pedido,   key: 'id' } },
  producto_id: { type: DataTypes.INTEGER, references: { model: Producto, key: 'id' } },
  cantidad:    { type: DataTypes.INTEGER, allowNull: false },
  precio_unit: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  subtotal:    { type: DataTypes.DECIMAL(10, 2), allowNull: false },
}, { tableName: 'pedido_items', timestamps: false })

PedidoItem.belongsTo(Pedido,   { foreignKey: 'pedido_id',   as: 'pedido' })
PedidoItem.belongsTo(Producto, { foreignKey: 'producto_id', as: 'producto' })
Pedido.hasMany(PedidoItem,     { foreignKey: 'pedido_id',   as: 'items' })
Producto.hasMany(PedidoItem,   { foreignKey: 'producto_id', as: 'pedido_items' })

export default PedidoItem
