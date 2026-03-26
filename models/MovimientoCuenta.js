import { DataTypes } from 'sequelize'
import { sequelize } from '../database.js'
import CuentaCorriente from './CuentaCorriente.js'

const MovimientoCuenta = sequelize.define('MovimientoCuenta', {
  id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  cuenta_id:  { type: DataTypes.INTEGER, allowNull: false, references: { model: CuentaCorriente, key: 'id' } },
  fecha:      { type: DataTypes.DATEONLY, allowNull: false },
  tipo:       { type: DataTypes.ENUM('cargo', 'pago'), allowNull: false },
  concepto:   { type: DataTypes.STRING(500), allowNull: false },
  monto:      { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  gasto_id:   { type: DataTypes.INTEGER, allowNull: true }, // referencia al gasto auto-creado
}, { tableName: 'movimientos_cuenta', timestamps: true })

CuentaCorriente.hasMany(MovimientoCuenta, { foreignKey: 'cuenta_id', as: 'movimientos' })
MovimientoCuenta.belongsTo(CuentaCorriente, { foreignKey: 'cuenta_id', as: 'cuenta' })

export default MovimientoCuenta
