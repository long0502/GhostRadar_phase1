require('dotenv').config();

const { Client } = require('pg');
const { spawn } = require('node:child_process');

const DEFAULTS = {
  PORT: '8088',
  DB_HOST: 'db',
  DB_PORT: '5432',
  DB_USER: 'ghostradar',
  DB_PASSWORD: 'ghostradar',
  DB_NAME: 'ghostradar',
  DB_WAIT_MAX_ATTEMPTS: '20',
  DB_WAIT_INTERVAL_MS: '3000',
};

for (const [key, value] of Object.entries(DEFAULTS)) {
  if (!process.env[key] || process.env[key].trim() === '') {
    process.env[key] = value;
  }
}

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;
}

const maxAttempts = Number.parseInt(process.env.DB_WAIT_MAX_ATTEMPTS, 10) || 20;
const intervalMs = Number.parseInt(process.env.DB_WAIT_INTERVAL_MS, 10) || 3000;

async function waitForDatabase() {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const client = new Client({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 3000,
    });

    try {
      await client.connect();
      await client.query('SELECT 1');
      await client.end();
      console.log(`Database ready after ${attempt} attempt(s).`);
      return;
    } catch (error) {
      await client.end().catch(() => {});
      const message = error instanceof Error ? error.message : String(error);
      console.log(`Database not ready yet (attempt ${attempt}/${maxAttempts}): ${message}`);

      if (attempt === maxAttempts) {
        throw new Error('Database did not become ready in time.');
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      env: process.env,
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(' ')} failed with exit code ${code}`));
    });

    child.on('error', reject);
  });
}

async function main() {
  await waitForDatabase();
  await runCommand('npx', ['prisma', 'db', 'push', '--schema=./prisma/schema.prisma']);
  await runCommand('npm', ['run', 'start:prod']);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
