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
-- Allow users to view messages in groups they're part of
CREATE POLICY "Users can view messages in their group"
ON messages FOR SELECT
USING (
  group_id IS NULL OR
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
    AND users.group_id = messages.group_id
  )
);

-- Allow authenticated users to insert messages
-- (app code ensures they're in the right group)
CREATE POLICY "Authenticated users can insert messages"
ON messages FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow users to update their own messages
CREATE POLICY "Users can update their own messages"
ON messages FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
    AND users.id = messages.user_id
  )
);

-- Allow users to delete their own messages or system messages
CREATE POLICY "Users can delete messages"
ON messages FOR DELETE
USING (
  is_system = true OR
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
  group_id IS NULL OR
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
    AND users.group_id = exams.group_id
  )
);

-- Allow authenticated users to insert exams
-- (app code ensures they're in the right group)
CREATE POLICY "Authenticated users can insert exams"
ON exams FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow authenticated users to update exams in their group
CREATE POLICY "Users can update exams in their group"
ON exams FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
    AND users.group_id = exams.group_id
  )
);

-- Allow authenticated users to delete exams in their group
CREATE POLICY "Users can delete exams in their group"
ON exams FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
    AND users.group_id = exams.group_id
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
users to view other users in their group (or any user if needed)
CREATE POLICY "Users can view members in their group"
ON users FOR SELECT
USING (
  auth.uid() = auth_id OR
  group_id IS NULL OR
  EXISTS (
    SELECT 1 FROM users AS current_user
    WHERE current_user.auth_id = auth.uid()
    AND current_user.group_id = users.group_id
  )
);

-- Allow authenticated users to create their own user record
CREATE POLICY "Authenticated users can create user records"
ON users FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = auth_id);

-- Allow users to update their own record
CREATE POLICY "Users can update their own record"
ON users FOR UPDATE
USING (auth.uid() = auth_id);

-- Allow authenticated users to delete user records in their group
-- (needed for cleanup operations)
CREATE POLICY "Users can delete records in their group"
ON users FOR DELETE
USING (
  auth.uid() = auth_id OR
  EXISTS (
    SELECT 1 FROM users AS current_user
    WHERE current_user.auth_id = auth.uid()
    AND current_user.group_id = users.group_id
  )
s WHERE tablename = 'messages';

-- Check exams policies
-- SELECT * FROM pg_policies WHERE tablename = 'exams';

-- Check users policies
-- SELECT * FROM pg_policies WHERE tablename = 'users';
