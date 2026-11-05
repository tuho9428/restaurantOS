import "server-only";

import { parseRuntimeEnv } from "./env-schema";

export const runtimeEnv = parseRuntimeEnv(process.env);
