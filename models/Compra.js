import { DataTypes } from 'sequelize'
import { sequelize } from '../database.js'
import CuentaCorriente from './CuentaCorriente.js'

// Compra a un proveedor: insumos (materia prima, envases) y/o productos para revender (Market).
// Al registrarla suma stock, actualiza costos y genera el gasto (contado) o el cargo en la
// cuenta corriente del proveedor (a cuenta). Anularla revierte todo.
const Compra = sequelize.define('Compra', {
  id:               { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  fecha:            { type: DataTypes.DATEONLY, allowNull: false },
  cuenta_id:        { type: DataTypes.INTEGER, allowNull: false, references: { model: CuentaCorriente, key: 'id' } },
  proveedor:        { type: DataTypes.STRING(200), allowNull: false },   // nombre al momento de la compra
  tipo_comprobante: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'sin_comprobante' },
  nro_comprobante:  { type: DataTypes.STRING(50), allowNull: true },
  condicion:        { type: DataTypes.ENUM('contado', 'cuenta_corriente'), allowNull: false },
  metodo_pago:      { type: DataTypes.ENUM('efectivo', 'transferencia', 'debito', 'credito', 'qr'), allowNull: true },
  alicuota_iva:     { type: DataTypes.DECIMAL(5, 2), allowNull: true },     // solo factura A
  iva_monto:        { type: DataTypes.DECIMAL(12, 2), allowNull: true },
  total:            { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  nota:             { type: DataTypes.STRING(500), allowNull: true },
  comprobante:      { type: DataTypes.STRING(300), allowNull: true },       // foto/PDF de la factura
  usuario:          { type: DataTypes.STRING(100), allowNull: true },
  estado:           { type: DataTypes.ENUM('vigente', 'anulada'), allowNull: false, defaultValue: 'vigente' },
  anulada_por:      { type: DataTypes.STRING(100), allowNull: true },
  anulada_el:       { type: DataTypes.DATE, allowNull: true },
}, { tableName: 'compras', timestamps: true })

Compra.belongsTo(CuentaCorriente, { foreignKey: 'cuenta_id', as: 'cuenta' })

export default Compra
