import { createHash } from "node:crypto";
import { Client } from "pg";

const targets = [
  ["development", process.env.DATABASE_URL_UNPOOLED, "ep-gentle-base-bbbmhrgr"],
  ["test", process.env.TEST_DIRECT_DATABASE_URL, "ep-damp-fog-bbyhbqkf"],
  ["shadow", process.env.SHADOW_DATABASE_URL, "ep-delicate-forest-bbvq36so"],
];

let failed = false;
const identities = new Set();

for (const [name, connectionString, expectedEndpoint] of targets) {
  if (!connectionString) {
    console.error(`${name}: required direct connection variable is missing`);
    failed = true;
    continue;
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: true },
    connectionTimeoutMillis: 10_000,
  });

  try {
    await client.connect();
    const { rows } = await client.query(`
      SELECT current_database() AS database_name,
             current_setting('server_version_num') AS version_num,
             (SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()) AS tls,
             (SELECT count(*)::int FROM information_schema.tables
              WHERE table_schema = 'public' AND table_type = 'BASE TABLE') AS user_tables,
             (SELECT json_agg(table_schema || '.' || table_name ORDER BY table_schema, table_name)
              FROM information_schema.tables
              WHERE table_schema = 'public' AND table_type = 'BASE TABLE') AS table_names,
             current_setting('search_path') AS search_path,
             to_regclass('public._prisma_migrations') IS NOT NULL AS has_migration_history,
             (SELECT json_agg(table_name ORDER BY table_name)
              FROM information_schema.tables
              WHERE table_schema = 'neon_auth' AND table_type = 'BASE TABLE') AS neon_auth_tables
    `);
    const row = rows[0];
    const host = new URL(connectionString).hostname.replace(/-pooler(?=\.)/, "");
    const endpoint = host.split(".")[0];
    const identity = createHash("sha256")
      .update(`${host}/${row.database_name}`)
      .digest("hex")
      .slice(0, 12);
    identities.add(identity);
    const major = Math.floor(Number(row.version_num) / 10_000);
    const socket = client.connection.stream;
    const tls = socket.encrypted === true && socket.authorized === true;
    const protocol = tls ? socket.getProtocol() : "none";
    console.log(`${name}: endpoint ${endpoint}; expected endpoint ${expectedEndpoint}; PostgreSQL ${major}; TLS ${tls ? protocol : "not verified"}; certificate authorized ${socket.authorized === true}; target ${identity}; public tables ${row.user_tables}; names ${JSON.stringify(row.table_names)}; search_path ${row.search_path}; migration history ${row.has_migration_history}; Neon Auth tables ${JSON.stringify(row.neon_auth_tables)}`);
    if (endpoint !== expectedEndpoint || major !== 18 || !tls) failed = true;
  } catch (error) {
    const code = error instanceof Error && "code" in error ? error.code : "CONNECTION_ERROR";
    console.error(`${name}: connection failed (${String(code)})`);
    failed = true;
  } finally {
    await client.end().catch(() => {});
  }
}

if (identities.size !== targets.length) {
  console.error("development and test targets are not isolated");
  failed = true;
}

if (failed) process.exitCode = 1;
