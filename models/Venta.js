import { DataTypes } from 'sequelize'
import { sequelize } from '../database.js'

const Venta = sequelize.define('Venta', {
  id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  fecha:        { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  tipo:         { type: DataTypes.ENUM('online', 'local'), defaultValue: 'local' },
  total:        { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
  nota:         { type: DataTypes.STRING(500) },
  metodo_pago:  { type: DataTypes.ENUM('efectivo', 'transferencia', 'debito', 'credito', 'qr', 'cuenta_corriente'), allowNull: true },
  descuento:    { type: DataTypes.DECIMAL(5, 2), defaultValue: 0 },
}, { tableName: 'ventas', timestamps: false })

export default Venta
