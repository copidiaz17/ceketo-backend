import { Sequelize } from 'sequelize'
import dotenv from 'dotenv'
dotenv.config()

const sslEnabled = process.env.DB_SSL === 'true'

export const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD || null,
  {
    host:    process.env.DB_HOST,
    port:    parseInt(process.env.DB_PORT || '3306'),
    dialect: 'mysql',
    timezone: '+00:00',
    logging: false,
    dialectOptions: sslEnabled
      ? { ssl: { rejectUnauthorized: false }, connectTimeout: 30000 }
      : { connectTimeout: 30000 },
    pool: {
      max: 5,
      min: 1,
      acquire: 30000,   // reducido: falla rápido si no hay conexión disponible
      idle: 600000,     // 10 minutos: mantiene la conexión viva más tiempo
      evict: 10000,     // cada 10s verifica y elimina conexiones muertas
    },
  }
)
