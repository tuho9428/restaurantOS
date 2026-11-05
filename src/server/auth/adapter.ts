import { randomBytes } from "node:crypto";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import type { PrismaClient } from "@/generated/prisma/client";

/** Adds RestaurantOS-only session security fields to Auth.js session creation. */
export function createRestaurantOsAuthAdapter(prisma: PrismaClient): Adapter {
  const adapter = PrismaAdapter(prisma as never);
  const createSession = adapter.createSession;
  if (!createSession) throw new Error("Auth.js adapter must support database sessions");

  return {
    ...adapter,
    async createSession(data) {
      const secureData = {
        ...data,
        lastAuthenticatedAt: new Date(),
        businessCsrfToken: randomBytes(32).toString("base64url"),
      };
      return createSession(secureData as typeof data);
    },
  };
}
