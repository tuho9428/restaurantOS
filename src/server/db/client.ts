import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { Pool } from "pg";
import { runtimeEnv } from "@/server/env";

const globalForPrisma = globalThis as typeof globalThis & {
  restaurantOsPrisma?: PrismaClient;
};

function createPrismaClient() {
  const pool = new Pool({
    connectionString: runtimeEnv.DATABASE_URL,
    max: 5,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    ssl: { rejectUnauthorized: true },
  });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.restaurantOsPrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.restaurantOsPrisma = prisma;
}
