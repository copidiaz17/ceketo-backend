import bcrypt from 'bcryptjs'
import { createInterface } from 'readline'
import { sequelize } from '../database.js'
import Usuario from '../models/Usuario.js'

const rl = createInterface({ input: process.stdin, output: process.stdout })
const ask = (q) => new Promise(r => rl.question(q, r))

async function main() {
  await sequelize.authenticate()
  await sequelize.sync({ force: false })

  console.log('\n--- Seed de usuarios CEKETO ---\n')

  const adminPass   = await ask('Password para "admin":   ')
  const fabricaPass = await ask('Password para "fabrica": ')
  rl.close()

  const [adminUser]   = await Usuario.upsert({ usuario: 'admin',   password: await bcrypt.hash(adminPass,   10), rol: 'admin'   })
  const [fabricaUser] = await Usuario.upsert({ usuario: 'fabrica', password: await bcrypt.hash(fabricaPass, 10), rol: 'fabrica' })

  console.log('\n✓ Usuario "admin"   creado/actualizado')
  console.log('✓ Usuario "fabrica" creado/actualizado')
  console.log('\nListo. Ya podés cerrar.\n')

  await sequelize.close()
}

main().catch(err => { console.error(err); process.exit(1) })
