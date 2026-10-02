import { DataTypes } from 'sequelize'
import { sequelize } from '../database.js'
import Compra from './Compra.js'
import Insumo from './Insumo.js'
import Producto from './Producto.js'

// Renglón de una compra: un insumo o un producto, con cantidad y costo unitario (IVA incluido)
const CompraItem = sequelize.define('CompraItem', {
  id:             { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  compra_id:      { type: DataTypes.INTEGER, allowNull: false, references: { model: Compra, key: 'id' } },
  tipo:           { type: DataTypes.ENUM('insumo', 'producto'), allowNull: false },
  insumo_id:      { type: DataTypes.INTEGER, allowNull: true, references: { model: Insumo, key: 'id' } },
  producto_id:    { type: DataTypes.INTEGER, allowNull: true, references: { model: Producto, key: 'id' } },
  descripcion:    { type: DataTypes.STRING(200), allowNull: false },   // nombre al momento de la compra
  unidad:         { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'unidad' },
  cantidad:       { type: DataTypes.DECIMAL(12, 3), allowNull: false },
  costo_unitario: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  subtotal:       { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  costo_anterior: { type: DataTypes.DECIMAL(12, 2), allowNull: true },  // para volver atrás si se anula
}, { tableName: 'compra_items', timestamps: false })

Compra.hasMany(CompraItem, { foreignKey: 'compra_id', as: 'items' })
CompraItem.belongsTo(Compra, { foreignKey: 'compra_id', as: 'compra' })
CompraItem.belongsTo(Insumo, { foreignKey: 'insumo_id', as: 'insumo' })
CompraItem.belongsTo(Producto, { foreignKey: 'producto_id', as: 'producto' })

export default CompraItem
