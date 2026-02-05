-- Add timer state columns and updated_at to users table
-- Run this in your Supabase SQL Editor

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS timer_state TEXT,
ADD COLUMN IF NOT EXISTS timer_seconds INTEGER,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add updated_at to study_groups if not exists
ALTER TABLE study_groups
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_users_group_auth ON users(group_id, auth_id);

-- Update existing users to have default values
UPDATE users 
SET timer_state = COALESCE(timer_state, 'idle'), 
    timer_seconds = COALESCE(timer_seconds, 1500),
    updated_at = COALESCE(updated_at, NOW())
WHERE timer_state IS NULL OR timer_seconds IS NULL OR updated_at IS NULL;
