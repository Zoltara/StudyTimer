-- Supabase Security Fixes
-- This SQL file addresses all security issues identified in the Supabase dashboard

-- ============================================
-- 1. Enable HaveIBeenPwned password check
-- ============================================
-- This is configured in Supabase Dashboard under Authentication > Settings
-- Cannot be set via SQL, but needs to be manually enabled in the dashboard:
-- Go to: Authentication > Settings > Security and Sessions
-- Enable: "Check passwords against HaveIBeenPwned.org"

-- ============================================
-- 2. Fix RLS Policy for study_groups table
-- ============================================

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Allow all on study_groups" ON study_groups;

-- Create proper RLS policies for study_groups
-- Allow anyone to view public groups
CREATE POLICY "Anyone can view public study groups"
ON study_groups FOR SELECT
USING (is_public = true);

-- Allow authenticated users to view groups they created
CREATE POLICY "Users can view their own groups"
ON study_groups FOR SELECT
USING (auth.uid() = created_by);

-- Allow authenticated users to create groups
CREATE POLICY "Authenticated users can create groups"
ON study_groups FOR INSERT
WITH CHECK (auth.uid() = created_by);

-- Allow group creators to update their groups
CREATE POLICY "Creators can update their groups"
ON study_groups FOR UPDATE
USING (auth.uid() = created_by)
WITH CHECK (auth.uid() = created_by);

-- Allow group creators to delete their groups
CREATE POLICY "Creators can delete their groups"
ON study_groups FOR DELETE
USING (auth.uid() = created_by);

-- ============================================
-- 3. Fix RLS Policy for messages table
-- ============================================

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Allow all for messages" ON messages;

-- Create proper RLS policies for messages
-- Allow users to view messages in their group
CREATE POLICY "Users can view messages in their group"
ON messages FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
    AND users.group_id = messages.group_id
  )
);

-- Allow users to insert messages in their group
CREATE POLICY "Users can insert messages in their group"
ON messages FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
    AND users.group_id = messages.group_id
    AND users.id = messages.user_id
  )
);

-- Allow users to update their own messages (optional - usually messages shouldn't be edited)
CREATE POLICY "Users can update their own messages"
ON messages FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
    AND users.id = messages.user_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
    AND users.id = messages.user_id
  )
);

-- Allow users to delete their own messages
CREATE POLICY "Users can delete their own messages"
ON messages FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
    AND users.id = messages.user_id
  )
);

-- ============================================
-- 4. Fix RLS Policy for exams table
-- ============================================

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Allow all for exams" ON exams;

-- Create proper RLS policies for exams
-- Allow users to view exams in their group
CREATE POLICY "Users can view exams in their group"
ON exams FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
    AND users.group_id = exams.group_id
  )
);

-- Allow users to insert exams in their group
CREATE POLICY "Users can insert exams in their group"
ON exams FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
    AND users.group_id = exams.group_id
    AND users.id = exams.user_id
  )
);

-- Allow users to update their own exams
CREATE POLICY "Users can update their own exams"
ON exams FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
    AND users.id = exams.user_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
    AND users.id = exams.user_id
  )
);

-- Allow users to delete their own exams
CREATE POLICY "Users can delete their own exams"
ON exams FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
    AND users.id = exams.user_id
  )
);

-- ============================================
-- 5. Add RLS policies for users table (if missing)
-- ============================================

-- Drop any overly permissive policies on users table
DROP POLICY IF EXISTS "Allow all on users" ON users;

-- Allow authenticated users to view other users in their group
CREATE POLICY "Users can view members in their group"
ON users FOR SELECT
USING (
  auth.uid() = auth_id OR
  EXISTS (
    SELECT 1 FROM users AS current_user
    WHERE current_user.auth_id = auth.uid()
    AND current_user.group_id = users.group_id
  )
);

-- Allow authenticated users to create their own user record
CREATE POLICY "Users can create their own record"
ON users FOR INSERT
WITH CHECK (auth.uid() = auth_id);

-- Allow users to update their own record
CREATE POLICY "Users can update their own record"
ON users FOR UPDATE
USING (auth.uid() = auth_id)
WITH CHECK (auth.uid() = auth_id);

-- Allow users to delete their own record
CREATE POLICY "Users can delete their own record"
ON users FOR DELETE
USING (auth.uid() = auth_id);

-- ============================================
-- Verification Queries
-- ============================================
-- Run these queries to verify the policies are correctly applied:

-- Check study_groups policies
-- SELECT * FROM pg_policies WHERE tablename = 'study_groups';

-- Check messages policies
-- SELECT * FROM pg_policies WHERE tablename = 'messages';

-- Check exams policies
-- SELECT * FROM pg_policies WHERE tablename = 'exams';

-- Check users policies
-- SELECT * FROM pg_policies WHERE tablename = 'users';
