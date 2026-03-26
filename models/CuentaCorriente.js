import { DataTypes } from 'sequelize'
import { sequelize } from '../database.js'

const CuentaCorriente = sequelize.define('CuentaCorriente', {
  id:       { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tipo:     { type: DataTypes.ENUM('cliente', 'proveedor'), allowNull: false },
  nombre:   { type: DataTypes.STRING(200), allowNull: false },
  telefono: { type: DataTypes.STRING(50), allowNull: true },
  email:    { type: DataTypes.STRING(200), allowNull: true },
  notas:    { type: DataTypes.STRING(500), allowNull: true },
}, { tableName: 'cuentas_corrientes', timestamps: true })

export default CuentaCorriente
