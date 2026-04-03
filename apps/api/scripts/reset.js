require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    const res = await prisma.ai_usage_daily.deleteMany({});
    console.log('Deleted rows:', res.count);
}
main().catch(console.error).finally(() => prisma.());
