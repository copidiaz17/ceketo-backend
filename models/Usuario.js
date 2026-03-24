import { DataTypes } from 'sequelize'
import { sequelize } from '../database.js'

const Usuario = sequelize.define('Usuario', {
  id:       { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  usuario:  { type: DataTypes.STRING(50), allowNull: false, unique: true },
  password: { type: DataTypes.STRING(255), allowNull: false },
  rol:      { type: DataTypes.ENUM('admin', 'fabrica'), allowNull: false, defaultValue: 'fabrica' },
  activo:   { type: DataTypes.BOOLEAN, defaultValue: true },
}, { tableName: 'usuarios', timestamps: false })

export default Usuario
