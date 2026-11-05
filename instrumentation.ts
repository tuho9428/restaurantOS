export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { parseRuntimeEnv } = await import("./src/server/env-schema");
    parseRuntimeEnv(process.env);
  }
}
