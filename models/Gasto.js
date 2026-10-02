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
      'Mercadería para reventa',
      'Otros'
    ),
    allowNull: false,
  },
  descripcion: { type: DataTypes.STRING(500), allowNull: false },
  monto:       { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  proveedor:   { type: DataTypes.STRING(200), allowNull: true },
  comprobante:  { type: DataTypes.STRING(300), allowNull: true },
  metodo_pago:  { type: DataTypes.ENUM('efectivo', 'transferencia', 'debito', 'credito', 'qr'), allowNull: true },
  es_factura:   { type: DataTypes.BOOLEAN, defaultValue: false },
  alicuota_iva: { type: DataTypes.DECIMAL(5, 2), allowNull: true },  // 10.5, 21, 27
  iva_monto:    { type: DataTypes.DECIMAL(12, 2), allowNull: true },  // IVA calculado
  compra_id:    { type: DataTypes.INTEGER, allowNull: true },          // gasto generado por una compra (se maneja desde Compras)
}, { tableName: 'gastos', timestamps: true })

export default Gasto
