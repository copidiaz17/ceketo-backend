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
  estado:       { type: DataTypes.ENUM('pendiente', 'en_preparacion', 'listo', 'enviado', 'entregado', 'cancelado'), defaultValue: 'pendiente' },
  total:        { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
  nota:         { type: DataTypes.STRING(500) },
  fecha:        { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, { tableName: 'pedidos', timestamps: false })

export default Pedido
