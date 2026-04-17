import { DataTypes } from 'sequelize'
import { sequelize } from '../database.js'

// Movimientos manuales dentro de una caja (retiros, ingresos extra, etc.)
const MovimientoCaja = sequelize.define('MovimientoCaja', {
  id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  caja_id:     { type: DataTypes.INTEGER, allowNull: false },
  tipo:        { type: DataTypes.ENUM('ingreso', 'egreso'), allowNull: false },
  concepto:    { type: DataTypes.STRING(300), allowNull: false },
  monto:       { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  medio:       { type: DataTypes.ENUM('efectivo', 'billetera'), allowNull: false, defaultValue: 'efectivo' },
}, { tableName: 'movimientos_caja', freezeTableName: true, timestamps: true })

export default MovimientoCaja
