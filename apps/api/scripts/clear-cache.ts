import { prisma } from '../src/db/prisma';

async function main() {
    console.log('--- CACHE CLEAR START ---');

    try {
        // Order matters because of foreign key constraints
        console.log('Deleting event_details...');
        const details = await prisma.event_details.deleteMany({});
        console.log(`Deleted ${details.count} event details.`);

        console.log('Deleting events...');
        const events = await prisma.events.deleteMany({});
        console.log(`Deleted ${events.count} events.`);

        console.log('Deleting grid_cache...');
        const cache = await prisma.grid_cache.deleteMany({});
        console.log(`Deleted ${cache.count} grid cache entries.`);

        console.log('--- CACHE CLEAR SUCCESS ---');
    } catch (error) {
        console.error('--- CACHE CLEAR FAILED ---');
        console.error(error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
