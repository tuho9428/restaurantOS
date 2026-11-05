import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { Client } from "pg";

const targets = [
  {
    name: "development",
    direct: "DATABASE_URL_UNPOOLED",
    pooled: "DATABASE_URL",
    endpoint: "ep-gentle-base-bbbmhrgr",
  },
  {
    name: "test",
    direct: "TEST_DIRECT_DATABASE_URL",
    pooled: "TEST_DATABASE_URL",
    endpoint: "ep-damp-fog-bbyhbqkf",
  },
];
const role = "restaurantos_runtime";
const envPath = ".env.local";
let envText = await readFile(envPath, "utf8");

function updateEnvValue(source, key, value) {
  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (!pattern.test(source))
    throw new Error(`${key} is missing from local environment configuration`);
  return source.replace(pattern, `${key}=${value}`);
}

for (const target of targets) {
  const directUrl = process.env[target.direct];
  const pooledUrl = process.env[target.pooled];
  if (!directUrl || !pooledUrl)
    throw new Error(`${target.name}: required database variables are missing`);
  const direct = new URL(directUrl);
  const pooled = new URL(pooledUrl);
  if (
    direct.hostname.replace(/-pooler(?=\.)/, "").split(".")[0] !== target.endpoint ||
    pooled.hostname.replace(/-pooler(?=\.)/, "").split(".")[0] !== target.endpoint ||
    !pooled.hostname.includes("-pooler.")
  ) {
    throw new Error(`${target.name}: endpoint identity or pooled/direct URL pairing failed`);
  }

  const password = randomBytes(32).toString("base64url");
  const admin = new Client({ connectionString: directUrl, ssl: { rejectUnauthorized: true } });
  await admin.connect();
  try {
    const identity = await admin.query(
      "SELECT current_database() AS db, current_setting('server_version_num')::int AS version, current_user AS role",
    );
    if (identity.rows[0].version < 180000 || identity.rows[0].role !== "neondb_owner") {
      throw new Error(`${target.name}: expected approved PostgreSQL 18 migration role`);
    }
    const existing = await admin.query("SELECT rolname FROM pg_roles WHERE rolname = $1", [role]);
    const memberships = await admin.query(
      "SELECT parent.rolname FROM pg_auth_members m JOIN pg_roles child ON child.oid=m.member JOIN pg_roles parent ON parent.oid=m.roleid WHERE child.rolname=$1",
      [role],
    );
    if (memberships.rowCount)
      throw new Error(
        `${target.name}: runtime role has role memberships; operator review required`,
      );
    if (existing.rowCount) {
      const details = await admin.query(
        "SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolinherit, rolcanlogin FROM pg_roles WHERE rolname=$1",
        [role],
      );
      const r = details.rows[0];
      if (
        r.rolsuper ||
        r.rolcreatedb ||
        r.rolcreaterole ||
        r.rolreplication ||
        r.rolinherit ||
        !r.rolcanlogin
      ) {
        throw new Error(
          `${target.name}: existing runtime role has unsafe attributes; operator review required`,
        );
      }
      const ddl = await admin.query(
        "SELECT format('ALTER ROLE %I PASSWORD %L', $1::text, $2::text)",
        [role, password],
      );
      await admin.query(ddl.rows[0].format);
    } else {
      const ddl = await admin.query(
        "SELECT format('CREATE ROLE %I LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD %L', $1::text, $2::text)",
        [role, password],
      );
      await admin.query(ddl.rows[0].format);
    }
    await admin.query("REVOKE ALL ON ALL TABLES IN SCHEMA public FROM restaurantos_runtime");
    await admin.query("REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM restaurantos_runtime");
    await admin.query(
      "GRANT CONNECT ON DATABASE " +
        '"' +
        identity.rows[0].db.replaceAll('"', '""') +
        '" TO restaurantos_runtime',
    );
    await admin.query("GRANT USAGE ON SCHEMA public TO restaurantos_runtime");
    await admin.query(
      "GRANT SELECT, INSERT, UPDATE ON public.users, public.restaurants, public.locations, public.memberships, public.membership_locations, public.business_day_policies TO restaurantos_runtime",
    );
    await admin.query(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts, public.sessions TO restaurantos_runtime",
    );
    await admin.query(
      "GRANT SELECT, INSERT, DELETE ON public.verification_tokens TO restaurantos_runtime",
    );
    await admin.query("GRANT SELECT, INSERT ON public.audit_logs TO restaurantos_runtime");

    pooled.username = role;
    pooled.password = password;
    envText = updateEnvValue(envText, target.pooled, pooled.toString());
    console.log(
      `${target.name}: runtime role provisioned; endpoint verified; credentials stored locally`,
    );
  } finally {
    await admin.end();
  }
}

await writeFile(envPath, envText, { encoding: "utf8", mode: 0o600 });
