-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- PostgreSQL 18 provides btree_gist as a trusted extension. Install before
-- the business-day effective-range exclusion constraint below.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- CreateEnum
CREATE TYPE "restaurant_status" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "membership_role" AS ENUM ('OWNER', 'MANAGER', 'HOST', 'INVENTORY', 'VIEWER');

-- CreateEnum
CREATE TYPE "membership_status" AS ENUM ('INVITED', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "actor_kind" AS ENUM ('USER', 'SYSTEM', 'SQUARE');

-- CreateTable
CREATE TABLE "restaurants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Los_Angeles',
    "business_day_cutoff" TIME(0) NOT NULL DEFAULT '03:00'::time,
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "status" "restaurant_status" NOT NULL DEFAULT 'ACTIVE',
    "settings_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "restaurants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "business_day_cutoff" TIME(0) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT,
    "email" TEXT NOT NULL,
    "email_verified_at" TIMESTAMPTZ(6),
    "image" TEXT,
    "disabled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("provider","provider_account_id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "session_token" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "expires" TIMESTAMPTZ(6) NOT NULL,
    "last_authenticated_at" TIMESTAMPTZ(6) NOT NULL,
    "business_csrf_token" TEXT
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMPTZ(6) NOT NULL
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "invite_email" TEXT NOT NULL,
    "role" "membership_role" NOT NULL,
    "status" "membership_status" NOT NULL DEFAULT 'INVITED',
    "invited_by_user_id" UUID,
    "invited_at" TIMESTAMPTZ(6),
    "accepted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_locations" (
    "restaurant_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,

    CONSTRAINT "membership_locations_pkey" PRIMARY KEY ("restaurant_id","membership_id","location_id")
);

-- CreateTable
CREATE TABLE "business_day_policies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurant_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "policy_version" INTEGER NOT NULL,
    "timezone" TEXT NOT NULL,
    "cutoff_local" TIME(0) NOT NULL,
    "effective_from" TIMESTAMPTZ(6) NOT NULL,
    "effective_to" TIMESTAMPTZ(6),
    "reason" TEXT NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_day_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurant_id" UUID NOT NULL,
    "location_id" UUID,
    "actor_user_id" UUID,
    "actor_kind" "actor_kind" NOT NULL,
    "request_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "reason" TEXT,
    "before_redacted" JSONB,
    "after_redacted" JSONB,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex

-- CreateIndex
CREATE INDEX "locations_restaurant_id_active_name_idx" ON "locations"("restaurant_id", "active", "name");

-- CreateIndex
CREATE UNIQUE INDEX "locations_restaurant_id_id_key" ON "locations"("restaurant_id", "id");

-- CreateIndex

-- CreateIndex

-- CreateIndex
CREATE INDEX "accounts_user_id_idx" ON "accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_session_token_key" ON "sessions"("session_token");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_idx" ON "sessions"("expires");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_token_key" ON "verification_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_identifier_token_key" ON "verification_tokens"("identifier", "token");

-- CreateIndex
CREATE INDEX "memberships_user_id_status_idx" ON "memberships"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_restaurant_id_user_id_key" ON "memberships"("restaurant_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_restaurant_id_id_key" ON "memberships"("restaurant_id", "id");

-- CreateIndex
CREATE INDEX "membership_locations_restaurant_id_location_id_idx" ON "membership_locations"("restaurant_id", "location_id");

-- CreateIndex
CREATE INDEX "business_day_policies_restaurant_id_location_id_effective_f_idx" ON "business_day_policies"("restaurant_id", "location_id", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "business_day_policies_restaurant_id_location_id_policy_vers_key" ON "business_day_policies"("restaurant_id", "location_id", "policy_version");

-- CreateIndex
CREATE UNIQUE INDEX "business_day_policies_restaurant_id_location_id_id_key" ON "business_day_policies"("restaurant_id", "location_id", "id");

-- CreateIndex
CREATE INDEX "audit_logs_restaurant_id_occurred_at_id_idx" ON "audit_logs"("restaurant_id", "occurred_at", "id");

-- CreateIndex
CREATE INDEX "audit_logs_restaurant_id_entity_type_entity_id_occurred_at_idx" ON "audit_logs"("restaurant_id", "entity_type", "entity_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_locations" ADD CONSTRAINT "membership_locations_restaurant_id_membership_id_fkey" FOREIGN KEY ("restaurant_id", "membership_id") REFERENCES "memberships"("restaurant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_locations" ADD CONSTRAINT "membership_locations_restaurant_id_location_id_fkey" FOREIGN KEY ("restaurant_id", "location_id") REFERENCES "locations"("restaurant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_day_policies" ADD CONSTRAINT "business_day_policies_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_day_policies" ADD CONSTRAINT "business_day_policies_restaurant_id_location_id_fkey" FOREIGN KEY ("restaurant_id", "location_id") REFERENCES "locations"("restaurant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Domain constraints that Prisma schema language cannot express.
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_slug_lowercase_chk" CHECK ("slug" = lower("slug"));
CREATE UNIQUE INDEX "restaurants_slug_lower_key" ON "restaurants"(lower("slug"));
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_currency_usd_chk" CHECK ("currency" = 'USD');
ALTER TABLE "locations" ADD CONSTRAINT "locations_currency_usd_chk" CHECK ("currency" = 'USD');
CREATE UNIQUE INDEX "locations_active_name_key" ON "locations"("restaurant_id", "name") WHERE "active";
ALTER TABLE "users" ADD CONSTRAINT "users_email_lowercase_chk" CHECK ("email" = lower("email"));
CREATE UNIQUE INDEX "users_email_lower_key" ON "users"(lower("email"));
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "business_day_policies" ADD CONSTRAINT "business_day_policies_creator_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "business_day_policies" ADD CONSTRAINT "business_day_policies_range_chk" CHECK ("effective_to" IS NULL OR "effective_to" > "effective_from");
ALTER TABLE "business_day_policies" ADD CONSTRAINT "business_day_policies_no_overlap" EXCLUDE USING gist (
  "restaurant_id" WITH =,
  "location_id" WITH =,
  tstzrange("effective_from", COALESCE("effective_to", 'infinity'::timestamptz), '[)') WITH &&
);
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_location_scope_fkey" FOREIGN KEY ("restaurant_id", "location_id") REFERENCES "locations"("restaurant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed the single v1 restaurant and location. Secret-bearing integrations and
-- users are provisioned by their owning tasks, never from migrations.
INSERT INTO "restaurants" ("id", "name", "slug", "timezone", "business_day_cutoff", "currency", "status", "settings_version", "updated_at")
VALUES ('11111111-1111-4111-8111-111111111111', 'RestaurantOS', 'restaurantos', 'America/Los_Angeles', '03:00', 'USD', 'ACTIVE', 1, now());

INSERT INTO "locations" ("id", "restaurant_id", "name", "timezone", "business_day_cutoff", "currency", "active", "updated_at")
VALUES ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'Primary Location', 'America/Los_Angeles', '03:00', 'USD', true, now());
