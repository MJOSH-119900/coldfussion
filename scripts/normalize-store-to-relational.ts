import { migrateStoreRecordsToRelational } from '../lib/json-store';
import { prisma } from '../server/db';

try {
    const imported = await migrateStoreRecordsToRelational();
    console.log(JSON.stringify(imported));
} finally {
    await prisma.$disconnect();
}
