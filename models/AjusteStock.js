import { DataTypes } from 'sequelize'
import { sequelize } from '../database.js'
import Producto from './Producto.js'

const AjusteStock = sequelize.define('AjusteStock', {
  id:                { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  producto_id:       { type: DataTypes.INTEGER, allowNull: false },
  stock_anterior:    { type: DataTypes.INTEGER, allowNull: false },
  stock_nuevo:       { type: DataTypes.INTEGER, allowNull: false },
  diferencia:        { type: DataTypes.INTEGER, allowNull: false },
  observacion:       { type: DataTypes.STRING(500), allowNull: true },
  usuario:           { type: DataTypes.STRING(100), allowNull: true },
}, { tableName: 'ajustes_stock', freezeTableName: true, timestamps: true })

AjusteStock.belongsTo(Producto, { foreignKey: 'producto_id', as: 'producto' })

export default AjusteStock
