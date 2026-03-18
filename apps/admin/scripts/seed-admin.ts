import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import bcrypt from 'bcryptjs';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function seed() {
  const password = 'ghostadmin123';
  const hash = await bcrypt.hash(password, 12);

  const user = await prisma.admin_users.upsert({
    where: { email: 'admin@ghostradar.app' },
    update: { password_hash: hash },
    create: {
      email: 'admin@ghostradar.app',
      password_hash: hash,
      role: 'superadmin',
    },
  });

  console.log('Admin user seeded:', user.email, user.role);
  await prisma.$disconnect();
  await pool.end();
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
