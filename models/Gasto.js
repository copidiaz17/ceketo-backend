import { DataTypes } from 'sequelize'
import { sequelize } from '../database.js'

const Gasto = sequelize.define('Gasto', {
  id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  fecha:       { type: DataTypes.DATEONLY, allowNull: false },
  categoria:   {
    type: DataTypes.ENUM(
      'Materia Prima',
      'Alquiler',
      'Servicios',
      'Sueldos',
      'Mantenimiento',
      'Packaging',
      'Otros'
    ),
    allowNull: false,
  },
  descripcion: { type: DataTypes.STRING(500), allowNull: false },
  monto:       { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  proveedor:   { type: DataTypes.STRING(200), allowNull: true },
  comprobante: { type: DataTypes.STRING(300), allowNull: true },  // ruta del archivo
}, { tableName: 'gastos', timestamps: true })

export default Gasto
