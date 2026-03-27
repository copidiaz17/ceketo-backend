import { DataTypes } from 'sequelize'
import { sequelize } from '../database.js'

// Una caja representa un turno: apertura → movimientos → cierre/arqueo
const Caja = sequelize.define('Caja', {
  id:              { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  fecha_apertura:  { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  fecha_cierre:    { type: DataTypes.DATE, allowNull: true },
  saldo_inicial:          { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  saldo_billetera_inicial:{ type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  // Arqueo: lo que realmente hay en caja al cerrar
  arqueo_efectivo:        { type: DataTypes.DECIMAL(12, 2), allowNull: true },
  arqueo_billetera:       { type: DataTypes.DECIMAL(12, 2), allowNull: true },
  // Usuario que abrió la caja
  usuario:         { type: DataTypes.STRING(100), allowNull: true },
  nota_cierre:     { type: DataTypes.STRING(500), allowNull: true },
  estado:          { type: DataTypes.ENUM('abierta', 'cerrada'), defaultValue: 'abierta' },
}, { tableName: 'cajas', freezeTableName: true, timestamps: true })

export default Caja
