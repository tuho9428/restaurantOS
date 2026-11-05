import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const clientSourceDirectories = ["app", "src/components"];
const forbiddenClientImports = [
  /from\s+["']@\/server\/env["']/,
  /from\s+["'][^"']*server\/env["']/,
  /import\s+["']@\/server\/env["']/,
  /import\s+["'][^"']*server\/env["']/,
];

function getSourceFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return getSourceFiles(path);
    return /\.[cm]?[jt]sx?$/.test(entry.name) ? [path] : [];
  });
}

describe("server environment module boundary", () => {
  it("marks server environment access as server-only", () => {
    const source = readFileSync("src/server/env.ts", "utf8");

    expect(source).toMatch(/^import ["']server-only["'];/m);
  });

  it("does not import the server environment module from client components", () => {
    const clientFiles = clientSourceDirectories.flatMap(getSourceFiles);
    const importingFiles = clientFiles.filter((file) => {
      const source = readFileSync(file, "utf8");
      return source.startsWith("'use client'") || source.startsWith('"use client"')
        ? forbiddenClientImports.some((pattern) => pattern.test(source))
        : false;
    });

    expect(importingFiles).toEqual([]);
  });

  it("does not include secret environment identifiers in browser bundles", () => {
    const browserOutput = ".next/static";
    if (!existsSync(browserOutput)) return;

    const staticFiles = getSourceFiles(browserOutput);
    const leakedFiles = staticFiles.filter((file) => {
      const source = readFileSync(file, "utf8");
      return ["AUTH_SECRET", "DATABASE_URL", "SQUARE_ACCESS_TOKEN"].some((secretName) =>
        source.includes(secretName),
      );
    });

    expect(leakedFiles).toEqual([]);
  });
});
