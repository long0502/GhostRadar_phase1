import { config } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import pkg from 'pg';
import { getDatabaseUrl } from '../utils/env';

config();

const { Pool } = pkg;

const pool = new Pool({
  connectionString: getDatabaseUrl(),
});

const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({
  adapter,
});
