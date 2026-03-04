import { PrismaNeonHttp } from '@prisma/adapter-neon';
import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const connectionString = process.env.DATABASE_URL;
console.log('Database connection string:', connectionString ? 'Loaded' + connectionString : 'Not found');
if (!connectionString) {
    throw new Error("DATABASE_URL is missing!!!");
}

const adapter = new PrismaNeonHttp(connectionString);
const prisma = new PrismaClient({ adapter });

export { prisma };