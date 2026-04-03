import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    await prisma.ai_usage_daily.deleteMany();
    console.log('RESET QUOTA SUCCESS');
}
main().finally(() => prisma.());
