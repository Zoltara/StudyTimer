-- Add timer state columns to users table for syncing
-- Run this in your Supabase SQL Editor

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS timer_state TEXT,
ADD COLUMN IF NOT EXISTS timer_seconds INTEGER;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_users_group_auth ON users(group_id, auth_id);

-- Update existing users to have default timer state
UPDATE users 
SET timer_state = 'idle', timer_seconds = 1500 
WHERE timer_state IS NULL;
