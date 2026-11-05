import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { defineConfig, env } from "prisma/config";

if (existsSync(".env.local")) loadEnvFile(".env.local");

const isTest = process.env.APP_ENV === "test";
const commandNeedsDatabase = process.argv.some((argument) =>
  /^(migrate|db|studio|introspect|generate\s+--sql)$/.test(argument),
);
const directUrlName = isTest ? "TEST_DIRECT_DATABASE_URL" : "DATABASE_URL_UNPOOLED";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    // Generation and application builds do not require migration credentials.
    // Database commands still fail closed when their direct URL is absent.
    url: commandNeedsDatabase ? env(directUrlName) : (process.env[directUrlName] ?? ""),
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL ?? "",
  },
});
