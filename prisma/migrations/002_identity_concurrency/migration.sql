-- Additive identity concurrency metadata. Migration 001 remains immutable.
ALTER TABLE public.restaurants
  ADD COLUMN version integer NOT NULL DEFAULT 1,
  ADD CONSTRAINT restaurants_version_positive CHECK (version > 0);

ALTER TABLE public.locations
  ADD COLUMN version integer NOT NULL DEFAULT 1,
  ADD CONSTRAINT locations_version_positive CHECK (version > 0);

ALTER TABLE public.memberships
  ADD COLUMN version integer NOT NULL DEFAULT 1,
  ADD CONSTRAINT memberships_version_positive CHECK (version > 0);
