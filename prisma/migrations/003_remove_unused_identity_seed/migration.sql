-- Migration 001 is immutable. Remove only its exact placeholder rows when the
-- full seeded values are unchanged and no dependent application data exists.
-- Any edit, additional location, membership, grant, policy, or audit record
-- causes this migration to leave the rows untouched for operator review.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.locations
    WHERE id = '22222222-2222-4222-8222-222222222222'::uuid
      AND restaurant_id = '11111111-1111-4111-8111-111111111111'::uuid
      AND name = 'Primary Location'
      AND timezone = 'America/Los_Angeles'
      AND business_day_cutoff = '03:00'::time
      AND currency = 'USD'
      AND active = true
      AND archived_at IS NULL
      AND version = 1
  )
  AND NOT EXISTS (SELECT 1 FROM public.membership_locations WHERE location_id = '22222222-2222-4222-8222-222222222222'::uuid)
  AND NOT EXISTS (SELECT 1 FROM public.business_day_policies WHERE location_id = '22222222-2222-4222-8222-222222222222'::uuid)
  AND NOT EXISTS (SELECT 1 FROM public.audit_logs WHERE location_id = '22222222-2222-4222-8222-222222222222'::uuid)
  THEN
    DELETE FROM public.locations WHERE id = '22222222-2222-4222-8222-222222222222'::uuid;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.restaurants
    WHERE id = '11111111-1111-4111-8111-111111111111'::uuid
      AND name = 'RestaurantOS'
      AND slug = 'restaurantos'
      AND timezone = 'America/Los_Angeles'
      AND business_day_cutoff = '03:00'::time
      AND currency = 'USD'
      AND status = 'ACTIVE'
      AND settings_version = 1
      AND version = 1
  )
  AND NOT EXISTS (SELECT 1 FROM public.locations WHERE restaurant_id = '11111111-1111-4111-8111-111111111111'::uuid)
  AND NOT EXISTS (SELECT 1 FROM public.memberships WHERE restaurant_id = '11111111-1111-4111-8111-111111111111'::uuid)
  AND NOT EXISTS (SELECT 1 FROM public.audit_logs WHERE restaurant_id = '11111111-1111-4111-8111-111111111111'::uuid)
  AND NOT EXISTS (SELECT 1 FROM public.business_day_policies WHERE restaurant_id = '11111111-1111-4111-8111-111111111111'::uuid)
  THEN
    DELETE FROM public.restaurants WHERE id = '11111111-1111-4111-8111-111111111111'::uuid;
  END IF;
END $$;
