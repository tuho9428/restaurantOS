import { z } from "zod";

const optionalText = z.string().trim().min(1).optional();
const optionalUrl = z.string().url().optional();
const stringFlag = z.enum(["true", "false"]).optional();

const runtimeEnvSchema = z.object({
  APP_ENV: z.enum(["local", "test", "staging", "production"]),
  NODE_ENV: z.enum(["development", "test", "production"]).optional(),
  SQUARE_GATEWAY_MODE: z.enum(["FAKE", "LIVE"]).optional(),
  EMAIL_DELIVERY_MODE: z.enum(["SMTP", "CAPTURE"]).optional(),
  DEMO_DATA_ENABLED: stringFlag,
  DATABASE_URL: optionalText,
  DIRECT_DATABASE_URL: optionalText,
  AUTH_SECRET: optionalText,
  AUTH_URL: optionalUrl,
  EMAIL_SERVER: optionalText,
  EMAIL_FROM: optionalText,
  SQUARE_ENV: z.enum(["SANDBOX", "PRODUCTION"]).optional(),
  SQUARE_ACCESS_TOKEN: optionalText,
  SQUARE_APPLICATION_ID: optionalText,
  SQUARE_LOCATION_ID: optionalText,
  SQUARE_MERCHANT_ID: optionalText,
  SQUARE_WEBHOOK_SIGNATURE_KEY: optionalText,
  SQUARE_WEBHOOK_URL: optionalUrl,
  CRON_SECRET: optionalText,
  APP_URL: optionalUrl,
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).optional(),
  MAINTENANCE_MODE: stringFlag,
});

export type RuntimeEnvironment = ReturnType<typeof parseRuntimeEnv>;

/** Parse and validate only server runtime configuration; values are never serialized to the client. */
export function parseRuntimeEnv(input: Readonly<Record<string, string | undefined>>) {
  const parsed = runtimeEnvSchema.safeParse(input);

  if (!parsed.success) {
    const reasons = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid RestaurantOS environment: ${reasons}`);
  }

  const value = parsed.data;
  const environment = {
    ...value,
    SQUARE_GATEWAY_MODE:
      value.SQUARE_GATEWAY_MODE ?? (value.APP_ENV === "production" ? "LIVE" : "FAKE"),
    EMAIL_DELIVERY_MODE:
      value.EMAIL_DELIVERY_MODE ?? (value.APP_ENV === "production" ? "SMTP" : "CAPTURE"),
    DEMO_DATA_ENABLED: value.DEMO_DATA_ENABLED === "true",
    MAINTENANCE_MODE: value.MAINTENANCE_MODE === "true",
    LOG_LEVEL: value.LOG_LEVEL ?? "info",
  };

  if (
    environment.APP_ENV === "production" &&
    (environment.SQUARE_GATEWAY_MODE === "FAKE" ||
      environment.EMAIL_DELIVERY_MODE === "CAPTURE" ||
      environment.DEMO_DATA_ENABLED)
  ) {
    throw new Error(
      "Unsafe production configuration: fake Square, captured email, and demo data are disabled.",
    );
  }

  return environment;
}
