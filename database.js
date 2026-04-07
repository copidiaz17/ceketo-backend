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
    pool: { max: 5, min: 1, acquire: 60000, idle: 30000 },
  }
)
