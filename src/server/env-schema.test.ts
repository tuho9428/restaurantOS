import { describe, expect, it } from "vitest";
import { parseRuntimeEnv } from "./env-schema";

describe("parseRuntimeEnv", () => {
  it("starts in a nonproduction environment without Square credentials", () => {
    const env = parseRuntimeEnv({ APP_ENV: "local" });

    expect(env.APP_ENV).toBe("local");
    expect(env.SQUARE_GATEWAY_MODE).toBe("FAKE");
    expect(env.EMAIL_DELIVERY_MODE).toBe("CAPTURE");
    expect(env.SQUARE_ACCESS_TOKEN).toBeUndefined();
  });

  it("does not confuse a production-built staging artifact with production trust", () => {
    const env = parseRuntimeEnv({
      APP_ENV: "staging",
      NODE_ENV: "production",
      SQUARE_GATEWAY_MODE: "FAKE",
      EMAIL_DELIVERY_MODE: "CAPTURE",
      DEMO_DATA_ENABLED: "true",
    });

    expect(env.APP_ENV).toBe("staging");
    expect(env.NODE_ENV).toBe("production");
    expect(env.DEMO_DATA_ENABLED).toBe(true);
  });

  it.each([
    ["fake Square", { SQUARE_GATEWAY_MODE: "FAKE" }],
    ["captured email", { EMAIL_DELIVERY_MODE: "CAPTURE" }],
    ["demo data", { DEMO_DATA_ENABLED: "true" }],
  ])("rejects %s in the production deployment environment", (_name, unsafe) => {
    expect(() => parseRuntimeEnv({ APP_ENV: "production", ...unsafe })).toThrow(
      "Unsafe production configuration",
    );
  });

  it("defaults safe production modes and does not require credentials during build", () => {
    const env = parseRuntimeEnv({ APP_ENV: "production", NODE_ENV: "production" });

    expect(env.SQUARE_GATEWAY_MODE).toBe("LIVE");
    expect(env.EMAIL_DELIVERY_MODE).toBe("SMTP");
    expect(env.DEMO_DATA_ENABLED).toBe(false);
    expect(env.AUTH_SECRET).toBeUndefined();
  });

  it("requires an explicit deployment environment and validates booleans", () => {
    expect(() => parseRuntimeEnv({})).toThrow("Invalid RestaurantOS environment");
    expect(() => parseRuntimeEnv({ APP_ENV: "local", DEMO_DATA_ENABLED: "yes" })).toThrow(
      "Invalid RestaurantOS environment",
    );
  });

  it("does not include secret values in validation errors", () => {
    const secret = "do-not-print-this-token";
    let errorMessage = "";

    try {
      parseRuntimeEnv({ APP_ENV: "local", DATABASE_URL: "", SQUARE_ACCESS_TOKEN: secret });
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    }

    expect(errorMessage).toContain("Invalid RestaurantOS environment");
    expect(errorMessage).not.toContain(secret);
  });
});
