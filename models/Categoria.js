import { DataTypes } from 'sequelize'
import { sequelize } from '../database.js'

const Categoria = sequelize.define('Categoria', {
  id:     { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  codigo: { type: DataTypes.STRING(10), allowNull: false, unique: true },
  nombre: { type: DataTypes.STRING(100), allowNull: false },
}, { tableName: 'categorias', timestamps: false })

export default Categoria
