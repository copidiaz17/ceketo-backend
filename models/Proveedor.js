import { DataTypes } from 'sequelize'
import { sequelize } from '../database.js'

const Proveedor = sequelize.define('Proveedor', {
  id:       { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  nombre:   { type: DataTypes.STRING(200), allowNull: false },
  rubro:    { type: DataTypes.STRING(100), allowNull: true },
  cuit:     { type: DataTypes.STRING(30),  allowNull: true },
  telefono: { type: DataTypes.STRING(50),  allowNull: true },
  email:    { type: DataTypes.STRING(200), allowNull: true },
  nota:     { type: DataTypes.STRING(500), allowNull: true },
}, { tableName: 'proveedores', freezeTableName: true, timestamps: true })

export default Proveedor
