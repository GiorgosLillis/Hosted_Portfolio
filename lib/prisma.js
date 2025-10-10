import { PrismaClient } from '@prisma/client'

// 1. Declare a global variable to hold the PrismaClient instance.
//    This allows the instance to persist across "warm" function invocations.
const prismaClientSingleton = () => {
  return new PrismaClient()
}

// 2. Use the global object to store the instance in development,
//    preventing creation of new instances during hot reloads.
const prisma = globalThis.prisma ?? prismaClientSingleton()

// 3. In development, attach the instance to globalThis to reuse it.
if (process.env.NODE_ENV !== 'production') globalThis.prisma = prisma

// 4. Export the instance for use in all serverless functions.
export { prisma }