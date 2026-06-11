-- Migration: align absence_requests.absence_type with leave_requests.type vocabulary.
-- Old values: conges, rtt, maladie, teletravail
-- New values: conge-paye, maladie, sans-solde, evenement-familial, autre
--
-- Run this ONCE on the live database before restarting the application.

BEGIN;

-- 1. Temporarily drop the CHECK constraint so we can UPDATE values
ALTER TABLE absence_requests DROP CONSTRAINT IF EXISTS absence_requests_absence_type_check;

-- 2. Map old values to new canonical types
UPDATE absence_requests SET absence_type = 'conge-paye'  WHERE absence_type = 'conges';
UPDATE absence_requests SET absence_type = 'conge-paye'  WHERE absence_type = 'rtt';
UPDATE absence_requests SET absence_type = 'autre'       WHERE absence_type = 'teletravail';
-- 'maladie' stays as-is

-- 3. Widen the column to hold the longest new value ('evenement-familial' = 18 chars)
ALTER TABLE absence_requests ALTER COLUMN absence_type TYPE varchar(30);

-- 4. Add the new CHECK constraint
ALTER TABLE absence_requests
    ADD CONSTRAINT absence_requests_absence_type_check
    CHECK (absence_type IN ('conge-paye', 'maladie', 'sans-solde', 'evenement-familial', 'autre'));

COMMIT;
