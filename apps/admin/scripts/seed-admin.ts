import bcrypt from 'bcryptjs';

async function seed() {
  const password = 'ghostadmin123';
  const hash = await bcrypt.hash(password, 12);
  console.log(`INSERT INTO admin_users (email, password_hash, role) VALUES ('admin@ghostradar.app', '${hash}', 'superadmin') ON CONFLICT (email) DO NOTHING;`);
  console.log(`\nDefault admin credentials:\n  Email: admin@ghostradar.app\n  Password: ${password}`);
}

seed();
