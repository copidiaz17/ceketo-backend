import { DataTypes } from 'sequelize'
import { sequelize } from '../database.js'

const Usuario = sequelize.define('Usuario', {
  id:       { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  usuario:  { type: DataTypes.STRING(50), allowNull: false, unique: true },
  password: { type: DataTypes.STRING(255), allowNull: false },
  // 'contenido' = community manager: solo entra a Productos (ver middleware/roles.js)
  rol:      { type: DataTypes.ENUM('admin', 'fabrica', 'ventas', 'contenido'), allowNull: false, defaultValue: 'fabrica' },
  activo:   { type: DataTypes.BOOLEAN, defaultValue: true },
}, { tableName: 'usuarios', timestamps: false })

export default Usuario
