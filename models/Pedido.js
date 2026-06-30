import { DataTypes } from 'sequelize'
import { sequelize } from '../database.js'

const Pedido = sequelize.define('Pedido', {
  id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  nombre:       { type: DataTypes.STRING(150), allowNull: false },
  telefono:     { type: DataTypes.STRING(30), allowNull: false },
  email:        { type: DataTypes.STRING(150) },
  direccion:    { type: DataTypes.STRING(300) },
  localidad:    { type: DataTypes.STRING(100) },
  metodo_pago:  { type: DataTypes.ENUM('transferencia', 'efectivo', 'mercadopago'), defaultValue: 'transferencia' },
  tipo_entrega: { type: DataTypes.ENUM('retiro', 'envio'), defaultValue: 'retiro' },
  estado:       { type: DataTypes.ENUM('pendiente', 'en_preparacion', 'listo', 'enviado', 'entregado', 'cancelado'), defaultValue: 'pendiente' },
  total:        { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
  nota:         { type: DataTypes.STRING(500) },
  venta_id:     { type: DataTypes.INTEGER, allowNull: true },   // venta generada al confirmar en el POS
  fecha:        { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, { tableName: 'pedidos', timestamps: false })

export default Pedido
