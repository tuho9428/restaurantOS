import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { Client } from "pg";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { createRestaurantOsAuthAdapter } from "@/server/auth/adapter";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

loadEnvFile(".env.local");
const url = process.env.TEST_DIRECT_DATABASE_URL;
if (!url) throw new Error("TEST_DIRECT_DATABASE_URL is required");
const db = new Client({ connectionString: url, ssl: { rejectUnauthorized: true } });
const runtimeUrl = process.env.TEST_DATABASE_URL;
if (!runtimeUrl) throw new Error("TEST_DATABASE_URL is required");
const runtimeDb = new Client({ connectionString: runtimeUrl, ssl: { rejectUnauthorized: true } });
const pool = new Pool({
  connectionString: process.env.TEST_DATABASE_URL,
  ssl: { rejectUnauthorized: true },
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const authAdapter = createRestaurantOsAuthAdapter(prisma);

describe("T003 PostgreSQL constraints", () => {
  beforeAll(async () => {
    await db.connect();
    await runtimeDb.connect();
  });
  afterAll(async () => {
    await prisma.$disconnect();
    await runtimeDb.end();
    await db.end();
  });
  it("uses a restricted non-owner runtime role with no neon_auth access", async () => {
    const result = await runtimeDb.query(`
      SELECT current_user,
        r.rolsuper, r.rolcreatedb, r.rolcreaterole, r.rolreplication, r.rolinherit,
        pg_has_role(current_user, 'neon_superuser', 'MEMBER') AS neon_superuser_member,
        has_schema_privilege(current_user, 'public', 'CREATE') AS can_create_schema,
        has_table_privilege(current_user, 'public.audit_logs', 'INSERT') AS audit_insert,
        has_table_privilege(current_user, 'public.audit_logs', 'UPDATE') AS audit_update,
        has_table_privilege(current_user, 'public.audit_logs', 'DELETE') AS audit_delete,
        has_table_privilege(current_user, 'public.audit_logs', 'TRUNCATE') AS audit_truncate,
        has_table_privilege(current_user, 'public._prisma_migrations', 'SELECT') AS migration_select,
        has_table_privilege(current_user, 'public._prisma_migrations', 'UPDATE') AS migration_update,
        (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)) AS owned_app_tables
      FROM pg_roles r WHERE r.rolname=current_user
    `);
    const r = result.rows[0];
    expect(r.current_user).toBe("restaurantos_runtime");
    expect([
      r.rolsuper,
      r.rolcreatedb,
      r.rolcreaterole,
      r.rolreplication,
      r.rolinherit,
      r.neon_superuser_member,
      r.can_create_schema,
      r.audit_update,
      r.audit_delete,
      r.audit_truncate,
      r.migration_select,
      r.migration_update,
    ]).toEqual(Array(12).fill(false));
    expect(r.audit_insert).toBe(true);
    expect(Number(r.owned_app_tables)).toBe(0);
    const migrationIdentity = await db.query("SELECT current_user");
    expect(migrationIdentity.rows[0].current_user).not.toBe(r.current_user);
  });
  it("allows audit inserts but rejects audit mutation and schema/migration DDL", async () => {
    await runtimeDb.query("BEGIN");
    try {
      const restaurantId = randomUUID();
      await runtimeDb.query(
        "INSERT INTO public.restaurants(id,name,slug,updated_at) VALUES($1,'Runtime audit fixture',$2,now())",
        [restaurantId, `runtime-${restaurantId}`],
      );
      await runtimeDb.query(
        "INSERT INTO public.audit_logs(restaurant_id,actor_kind,request_id,action,entity_type,entity_id) VALUES($1,'SYSTEM',$2,'TEST','TEST','runtime-role')",
        [restaurantId, randomUUID()],
      );
      for (const [name, sql] of [
        [
          "audit update",
          "UPDATE public.audit_logs SET action='CHANGED' WHERE entity_id='runtime-role'",
        ],
        ["audit delete", "DELETE FROM public.audit_logs WHERE entity_id='runtime-role'"],
        ["audit truncate", "TRUNCATE public.audit_logs"],
        [
          "alter application table",
          "ALTER TABLE public.restaurants ADD COLUMN runtime_forbidden integer",
        ],
        ["drop application table", "DROP TABLE public.restaurants"],
        ["migration history read", "SELECT * FROM public._prisma_migrations"],
        ["migration history", "UPDATE public._prisma_migrations SET logs='changed' WHERE false"],
        ["schema DDL", "CREATE TABLE public.runtime_role_forbidden(id integer)"],
        ["neon_auth read", "SELECT 1 FROM neon_auth.user LIMIT 1"],
      ]) {
        await runtimeDb.query("SAVEPOINT privilege_check");
        await expect(runtimeDb.query(sql), name).rejects.toMatchObject({ code: "42501" });
        await runtimeDb.query("ROLLBACK TO SAVEPOINT privilege_check");
      }
    } finally {
      await runtimeDb.query("ROLLBACK");
    }
  });
  it("creates, reads, updates, expires, and deletes a secure Auth.js session", async () => {
    const user = await authAdapter.createUser!({
      id: randomUUID(),
      email: `${randomUUID()}@example.test`,
      emailVerified: null,
    });
    const token = randomUUID();
    const expires = new Date(Date.now() + 60_000);
    try {
      const created = await authAdapter.createSession!({
        sessionToken: token,
        userId: user.id,
        expires,
      });
      const secure = created as typeof created & {
        lastAuthenticatedAt: Date;
        businessCsrfToken: string;
      };
      expect(secure.lastAuthenticatedAt).toBeInstanceOf(Date);
      expect(Buffer.from(secure.businessCsrfToken, "base64url")).toHaveLength(32);
      const found = await authAdapter.getSessionAndUser!(token);
      expect(found?.user.id).toBe(user.id);
      const nextExpiry = new Date(Date.now() + 120_000);
      const updated = await authAdapter.updateSession!({
        sessionToken: token,
        expires: nextExpiry,
      });
      expect(updated?.expires.getTime()).toBe(nextExpiry.getTime());
      expect(updated?.expires.getTime()).toBeGreaterThan(Date.now());
      await authAdapter.deleteSession!(token);
      expect(await authAdapter.getSessionAndUser!(token)).toBeNull();
    } finally {
      await Promise.resolve(authAdapter.deleteSession!(token)).catch(() => null);
      // User deletion is intentionally denied to the runtime role; clean this
      // disposable fixture with the test migration role after adapter checks.
      await db.query("DELETE FROM public.users WHERE id=$1", [user.id]);
    }
  });
  it("provides the Auth.js Prisma adapter columns", async () => {
    const columns = await db.query(
      "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('users','accounts','sessions','verification_tokens')",
    );
    const actual = new Set(columns.rows.map((row) => `${row.table_name}.${row.column_name}`));
    for (const column of [
      "users.id",
      "users.email",
      "users.email_verified_at",
      "accounts.user_id",
      "accounts.provider",
      "accounts.provider_account_id",
      "sessions.session_token",
      "sessions.user_id",
      "sessions.expires",
      "verification_tokens.identifier",
      "verification_tokens.token",
      "verification_tokens.expires",
    ])
      expect(actual.has(column), column).toBe(true);
  });
  it("enforces membership, location, and restaurant settings compare-and-swap versions", async () => {
    const a = randomUUID(),
      l = randomUUID(),
      u = randomUUID(),
      m = randomUUID();
    await db.query(
      "INSERT INTO restaurants(id,name,slug,updated_at) VALUES($1,'CAS restaurant',$2,now())",
      [a, `cas-${a}`],
    );
    try {
      await db.query(
        "INSERT INTO locations(id,restaurant_id,name,timezone,business_day_cutoff,currency,updated_at) VALUES($1,$2,'CAS location','UTC','03:00','USD',now())",
        [l, a],
      );
      await db.query("INSERT INTO users(id,email,updated_at) VALUES($1,$2,now())", [
        u,
        `${u}@example.test`,
      ]);
      await db.query(
        "INSERT INTO memberships(id,restaurant_id,user_id,invite_email,role,updated_at) VALUES($1,$2,$3,$4,'MANAGER',now())",
        [m, a, u, `${u}@example.test`],
      );
      const x = new Client({ connectionString: url, ssl: { rejectUnauthorized: true } });
      const y = new Client({ connectionString: url, ssl: { rejectUnauthorized: true } });
      await Promise.all([x.connect(), y.connect()]);
      try {
        const specs = [
          [
            "restaurants",
            "name",
            a,
            "settings_version",
            "version",
            "Restaurant winner",
            "Stale restaurant",
          ],
          ["locations", "name", l, "version", "version", "Location winner", "Stale location"],
          ["memberships", "role", m, "version", "version", "VIEWER", "MANAGER"],
        ] as const;
        for (const [table, column, id, compare, increment, value, staleValue] of specs) {
          const sql = `UPDATE public.${table} SET ${column}=$1, ${increment}=${increment}+1${table === "restaurants" ? ", settings_version=settings_version+1" : ""} WHERE id=$2 AND ${compare}=1 RETURNING id`;
          const results = await Promise.all([x.query(sql, [value, id]), y.query(sql, [value, id])]);
          expect(
            results.reduce((n, r) => n + (r.rowCount ?? 0), 0),
            `${table} winners`,
          ).toBe(1);
          const stale = await x.query(
            `UPDATE public.${table} SET ${column}=$1 WHERE id=$2 AND ${compare}=1 RETURNING id`,
            [staleValue, id],
          );
          expect(stale.rowCount, `${table} stale update`).toBe(0);
        }
      } finally {
        await Promise.all([x.end(), y.end()]);
      }
      const final = await db.query(
        "SELECT r.name,r.settings_version,r.version AS restaurant_version,l.name AS location_name,l.version AS location_version,m.role,m.version AS membership_version FROM restaurants r JOIN locations l ON l.restaurant_id=r.id JOIN memberships m ON m.restaurant_id=r.id WHERE r.id=$1",
        [a],
      );
      expect(final.rows[0]).toMatchObject({
        name: "Restaurant winner",
        settings_version: 2,
        restaurant_version: 2,
        location_name: "Location winner",
        location_version: 2,
        role: "VIEWER",
        membership_version: 2,
      });
    } finally {
      await db.query("DELETE FROM memberships WHERE id=$1", [m]);
      await db.query("DELETE FROM locations WHERE id=$1", [l]);
      await db.query("DELETE FROM users WHERE id=$1", [u]);
      await db.query("DELETE FROM restaurants WHERE id=$1", [a]);
    }
  });
  it("enforces tenant FKs, case constraints, uniqueness, and policy ranges", async () => {
    const a = randomUUID(),
      b = randomUUID(),
      la = randomUUID(),
      lb = randomUUID(),
      u = randomUUID();
    await db.query("BEGIN");
    try {
      await db.query(
        "INSERT INTO restaurants(id,name,slug,updated_at) VALUES($1,'A',$2,now()),($3,'B',$4,now())",
        [a, `t-${a}`, b, `t-${b}`],
      );
      await db.query(
        "INSERT INTO locations(id,restaurant_id,name,timezone,business_day_cutoff,currency,updated_at) VALUES($1,$2,'Same','UTC','03:00','USD',now()),($3,$4,'Other','UTC','03:00','USD',now())",
        [la, a, lb, b],
      );
      await db.query("INSERT INTO users(id,email,updated_at) VALUES($1,$2,now())", [
        u,
        `${u}@example.test`,
      ]);
      const reject = async (name: string, sql: string, values: unknown[], code: string) => {
        await db.query("SAVEPOINT constraint_case");
        await expect(db.query(sql, values), name).rejects.toMatchObject({ code });
        await db.query("ROLLBACK TO SAVEPOINT constraint_case");
      };
      await reject(
        "uppercase slug",
        "INSERT INTO restaurants(name,slug,updated_at) VALUES('bad',$1,now())",
        [`UP-${a}`],
        "23514",
      );
      await reject(
        "uppercase email",
        "INSERT INTO users(email,updated_at) VALUES($1,now())",
        [`UP-${u}@example.test`],
        "23514",
      );
      await reject(
        "duplicate active location",
        "INSERT INTO locations(restaurant_id,name,timezone,business_day_cutoff,currency,updated_at) VALUES($1,'Same','UTC','03:00','USD',now())",
        [a],
        "23505",
      );
      await db.query(
        "INSERT INTO locations(restaurant_id,name,timezone,business_day_cutoff,currency,active,updated_at) VALUES($1,'Same','UTC','03:00','USD',false,now())",
        [a],
      );
      await reject(
        "cross-tenant audit location",
        "INSERT INTO audit_logs(restaurant_id,location_id,actor_kind,request_id,action,entity_type,entity_id) VALUES($1,$2,'SYSTEM',$3,'A','T','1')",
        [a, lb, randomUUID()],
        "23503",
      );
      await reject(
        "cross-tenant policy location",
        "INSERT INTO business_day_policies(restaurant_id,location_id,policy_version,timezone,cutoff_local,effective_from,reason,created_by_user_id) VALUES($1,$2,1,'UTC','03:00','2030-01-01Z','test',$3)",
        [a, lb, u],
        "23503",
      );
      const policy =
        "INSERT INTO business_day_policies(restaurant_id,location_id,policy_version,timezone,cutoff_local,effective_from,effective_to,reason,created_by_user_id) VALUES($1,$2,$3,'UTC','03:00',$4,$5,'test',$6)";
      await db.query(policy, [a, la, 1, "2030-01-01Z", "2030-02-01Z", u]);
      await reject(
        "overlapping policy",
        policy,
        [a, la, 2, "2030-01-15Z", "2030-03-01Z", u],
        "23P01",
      );
      await db.query(policy, [a, la, 2, "2030-02-01Z", "2030-03-01Z", u]);
      await db.query(
        "INSERT INTO restaurants(name,slug,updated_at) VALUES('case unique',$1,now())",
        [`lower-${a}`],
      );
      await reject(
        "case-insensitive duplicate slug",
        "INSERT INTO restaurants(name,slug,updated_at) VALUES('duplicate',$1,now())",
        [`lower-${a}`],
        "23505",
      );
      await db.query("INSERT INTO users(email,updated_at) VALUES($1,now())", [
        `lower-${a}@example.test`,
      ]);
      await reject(
        "case-insensitive duplicate email",
        "INSERT INTO users(email,updated_at) VALUES($1,now())",
        [`lower-${a}@example.test`],
        "23505",
      );
    } finally {
      await db.query("ROLLBACK");
    }
  });
  it("preserves a matching migration placeholder when it has dependent audit history", async () => {
    const restaurantId = "11111111-1111-4111-8111-111111111111";
    const locationId = "22222222-2222-4222-8222-222222222222";
    await db.query("BEGIN");
    try {
      await db.query(
        "INSERT INTO restaurants(id,name,slug,updated_at) VALUES($1,'RestaurantOS','restaurantos',now())",
        [restaurantId],
      );
      await db.query(
        "INSERT INTO locations(id,restaurant_id,name,timezone,business_day_cutoff,currency,updated_at) VALUES($1,$2,'Primary Location','America/Los_Angeles','03:00','USD',now())",
        [locationId, restaurantId],
      );
      await db.query(
        "INSERT INTO audit_logs(restaurant_id,location_id,actor_kind,request_id,action,entity_type,entity_id) VALUES($1,$2,'SYSTEM',$3,'KEEP','TEST','preserve')",
        [restaurantId, locationId, randomUUID()],
      );
      await db.query(
        readFileSync("prisma/migrations/003_remove_unused_identity_seed/migration.sql", "utf8"),
      );
      const rows = await db.query(
        "SELECT (SELECT count(*) FROM restaurants WHERE id=$1)::int AS restaurant,(SELECT count(*) FROM locations WHERE id=$2)::int AS location",
        [restaurantId, locationId],
      );
      expect(rows.rows[0]).toEqual({ restaurant: 1, location: 1 });
    } finally {
      await db.query("ROLLBACK");
    }
  });
  it("enforces migration history, composite tenant FKs, uniqueness, and normal FKs", async () => {
    const history = await db.query(
      'SELECT finished_at FROM public."_prisma_migrations" WHERE migration_name=$1',
      ["003_remove_unused_identity_seed"],
    );
    expect(history.rowCount).toBe(1);
    expect(history.rows[0].finished_at).not.toBeNull();
    await db.query("BEGIN");
    try {
      const a = randomUUID(),
        b = randomUUID(),
        la = randomUUID(),
        lb = randomUUID(),
        u = randomUUID(),
        m = randomUUID();
      await db.query(
        "INSERT INTO restaurants(id,name,slug,updated_at) VALUES($1,'A',$2,now()),($3,'B',$4,now())",
        [a, `t-${a}`, b, `t-${b}`],
      );
      await db.query(
        "INSERT INTO locations(id,restaurant_id,name,timezone,business_day_cutoff,currency,updated_at) VALUES($1,$2,'A','UTC','03:00','USD',now()),($3,$4,'B','UTC','03:00','USD',now())",
        [la, a, lb, b],
      );
      await db.query("INSERT INTO users(id,email,updated_at) VALUES($1,$2,now())", [
        u,
        `${u}@example.test`,
      ]);
      await db.query(
        "INSERT INTO memberships(id,restaurant_id,user_id,invite_email,role,updated_at) VALUES($1,$2,$3,$4,'OWNER',now())",
        [m, a, u, `${u}@example.test`],
      );
      await db.query("SAVEPOINT tenant_fk");
      await expect(
        db.query(
          "INSERT INTO membership_locations(restaurant_id,membership_id,location_id) VALUES($1,$2,$3)",
          [a, m, lb],
        ),
      ).rejects.toMatchObject({ code: "23503" });
      await db.query("ROLLBACK TO SAVEPOINT tenant_fk");
      await db.query("SAVEPOINT invalid_fk");
      await expect(
        db.query(
          "INSERT INTO locations(restaurant_id,name,timezone,business_day_cutoff,currency,updated_at) VALUES($1,'bad','UTC','03:00','USD',now())",
          [randomUUID()],
        ),
      ).rejects.toMatchObject({ code: "23503" });
      await db.query("ROLLBACK TO SAVEPOINT invalid_fk");
      await db.query("SAVEPOINT unique_membership");
      await expect(
        db.query(
          "INSERT INTO memberships(restaurant_id,user_id,invite_email,role,updated_at) VALUES($1,$2,$3,'OWNER',now())",
          [a, u, `${u}@example.test`],
        ),
      ).rejects.toMatchObject({ code: "23505" });
      await db.query("ROLLBACK TO SAVEPOINT unique_membership");
      await db.query("SAVEPOINT preserve_history");
      await expect(db.query("DELETE FROM restaurants WHERE id=$1", [a])).rejects.toMatchObject({
        code: "23001",
      });
      await db.query("ROLLBACK TO SAVEPOINT preserve_history");
    } finally {
      await db.query("ROLLBACK");
    }
  });
});
