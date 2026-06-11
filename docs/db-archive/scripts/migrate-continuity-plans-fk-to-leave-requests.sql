-- Migration: fix continuity_plans.request_id to reference leave_requests(id)
-- instead of absence_requests(request_id).
--
-- Run this ONCE against the live database after deploying the code change.
-- Safe to run even if continuity_plans is empty.

BEGIN;

-- Drop the old FK pointing to absence_requests
ALTER TABLE continuity_plans
    DROP CONSTRAINT IF EXISTS continuity_plans_request_id_fkey;

-- Resize the column to integer (leave_requests.id is SERIAL/integer)
-- Cast any existing bigint values (should be none in practice)
ALTER TABLE continuity_plans
    ALTER COLUMN request_id TYPE integer USING request_id::integer;

-- Add new FK pointing to leave_requests
ALTER TABLE continuity_plans
    ADD CONSTRAINT continuity_plans_request_id_fkey
    FOREIGN KEY (request_id) REFERENCES leave_requests(id) ON DELETE CASCADE;

COMMIT;
