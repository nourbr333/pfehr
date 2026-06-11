-- Add target_url column to notifications table to support navigation from notification click
ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS target_url VARCHAR(500);
