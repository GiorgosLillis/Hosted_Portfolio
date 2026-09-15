import { PrismaNeonHttp } from '@prisma/adapter-neon';
import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const connectionString = process.env.DATABASE_URL;
console.log('Database connection string status:', connectionString ? 'Loaded' : 'Not found');
if (!connectionString) {
    throw new Error("DATABASE_URL is missing!!!");
}

// The second arg's type is declared as required upstream even though every field is optional
const adapter = new PrismaNeonHttp(connectionString, {});
const prisma = new PrismaClient({ adapter });

export { prisma };
