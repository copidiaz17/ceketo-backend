import { DataTypes } from 'sequelize'
import { sequelize } from '../database.js'
import Categoria from './Categoria.js'

const Producto = sequelize.define('Producto', {
  id:            { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  codigo:        { type: DataTypes.STRING(20), allowNull: false, unique: true },
  nombre:        { type: DataTypes.STRING(200), allowNull: false },
  categoria_id:  { type: DataTypes.INTEGER, references: { model: Categoria, key: 'id' } },
  codigo_barras: { type: DataTypes.STRING(50) },
  precio:        { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
  stock:         { type: DataTypes.INTEGER, defaultValue: 0 },
  activo:        { type: DataTypes.BOOLEAN, defaultValue: true },
  imagen:        { type: DataTypes.STRING(255) },
}, { tableName: 'productos', timestamps: false })

Producto.belongsTo(Categoria, { foreignKey: 'categoria_id', as: 'categoria' })
Categoria.hasMany(Producto,   { foreignKey: 'categoria_id', as: 'productos' })

export default Producto
