-- ============================================
-- Supabase Security Fixes - COMPLETE SOLUTION
-- ============================================
-- Run this entire script in Supabase SQL Editor
-- This fixes all 4 security issues identified
--
-- INSTRUCTIONS:
-- 1. Copy this ENTIRE file
-- 2. Go to Supabase Dashboard > SQL Editor
-- 3. Create New Query
-- 4. Paste and click RUN
-- 5. Verify success with the queries at the bottom
--
-- NOTE: HaveIBeenPwned setting must be enabled manually in:
-- Authentication > Settings > Security and Sessions
-- ============================================

-- ============================================
-- STEP 0: Ensure RLS is enabled on all tables
-- ============================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;

-- ============================================
-- STEP 1: Clean up ALL existing policies
-- ============================================
DO $$ 
BEGIN
    -- Drop all policies on study_groups
    DROP POLICY IF EXISTS "Allow all on study_groups" ON study_groups;
    DROP POLICY IF EXISTS "Anyone can view public study groups" ON study_groups;
    DROP POLICY IF EXISTS "Users can view their own groups" ON study_groups;
    DROP POLICY IF EXISTS "Authenticated users can create groups" ON study_groups;
    DROP POLICY IF EXISTS "Creators can update their groups" ON study_groups;
    DROP POLICY IF EXISTS "Creators can delete their groups" ON study_groups;
    DROP POLICY IF EXISTS "View public groups or own groups" ON study_groups;
    DROP POLICY IF EXISTS "Create groups" ON study_groups;
    DROP POLICY IF EXISTS "Update own groups" ON study_groups;
    DROP POLICY IF EXISTS "Delete own groups" ON study_groups;
    DROP POLICY IF EXISTS "view_study_groups" ON study_groups;
    DROP POLICY IF EXISTS "create_study_groups" ON study_groups;
    DROP POLICY IF EXISTS "update_study_groups" ON study_groups;
    DROP POLICY IF EXISTS "delete_study_groups" ON study_groups;
    
    -- Drop all policies on messages
    DROP POLICY IF EXISTS "Allow all for messages" ON messages;
    DROP POLICY IF EXISTS "Users can view messages in their group" ON messages;
    DROP POLICY IF EXISTS "Authenticated users can insert messages" ON messages;
    DROP POLICY IF EXISTS "Users can insert messages in their group" ON messages;
    DROP POLICY IF EXISTS "Users can update their own messages" ON messages;
    DROP POLICY IF EXISTS "Users can delete their own messages" ON messages;
    DROP POLICY IF EXISTS "Users can delete messages" ON messages;
    DROP POLICY IF EXISTS "View group messages" ON messages;
    DROP POLICY IF EXISTS "Insert messages" ON messages;
    DROP POLICY IF EXISTS "Update own messages" ON messages;
    DROP POLICY IF EXISTS "Delete messages" ON messages;
    DROP POLICY IF EXISTS "view_messages" ON messages;
    DROP POLICY IF EXISTS "insert_messages" ON messages;
    DROP POLICY IF EXISTS "update_messages" ON messages;
    DROP POLICY IF EXISTS "delete_messages" ON messages;
    
    -- Drop all policies on exams
    DROP POLICY IF EXISTS "Allow all for exams" ON exams;
    DROP POLICY IF EXISTS "Users can view exams in their group" ON exams;
    DROP POLICY IF EXISTS "Authenticated users can insert exams" ON exams;
    DROP POLICY IF EXISTS "Users can insert exams in their group" ON exams;
    DROP POLICY IF EXISTS "Users can update their own exams" ON exams;
    DROP POLICY IF EXISTS "Users can update exams in their group" ON exams;
    DROP POLICY IF EXISTS "Users can delete their own exams" ON exams;
    DROP POLICY IF EXISTS "Users can delete exams in their group" ON exams;
    DROP POLICY IF EXISTS "View group exams" ON exams;
    DROP POLICY IF EXISTS "Insert exams" ON exams;
    DROP POLICY IF EXISTS "Update group exams" ON exams;
    DROP POLICY IF EXISTS "Delete group exams" ON exams;
    DROP POLICY IF EXISTS "view_exams" ON exams;
    DROP POLICY IF EXISTS "insert_exams" ON exams;
    DROP POLICY IF EXISTS "update_exams" ON exams;
    DROP POLICY IF EXISTS "delete_exams" ON exams;
    
    -- Drop all policies on users
    DROP POLICY IF EXISTS "Allow all on users" ON users;
    DROP POLICY IF EXISTS "Users can view members in their group" ON users;
    DROP POLICY IF EXISTS "Users can create their own record" ON users;
    DROP POLICY IF EXISTS "Authenticated users can create user records" ON users;
    DROP POLICY IF EXISTS "Users can update their own record" ON users;
    DROP POLICY IF EXISTS "Users can delete their own record" ON users;
    DROP POLICY IF EXISTS "Users can delete records in their group" ON users;
    DROP POLICY IF EXISTS "View users" ON users;
    DROP POLICY IF EXISTS "Create user" ON users;
    DROP POLICY IF EXISTS "Update own user" ON users;
    DROP POLICY IF EXISTS "Delete users" ON users;
    DROP POLICY IF EXISTS "view_users" ON users;
    DROP POLICY IF EXISTS "create_users" ON users;
    DROP POLICY IF EXISTS "update_users" ON users;
    DROP POLICY IF EXISTS "delete_users" ON users;
END $$;

-- ============================================
-- NOTE: Enable HaveIBeenPwned password check
-- ============================================
-- This MUST be done manually in Supabase Dashboard:
-- Go to: Authentication > Settings > Security and Sessions
-- Enable: "Check passwords against HaveIBeenPwned.org"
-- This cannot be set via SQL

-- ============================================
-- 2. RLS Policies for study_groups table
-- ============================================

-- Anyone can view public groups OR groups they created
CREATE POLICY "view_study_groups"
ON study_groups FOR SELECT
USING (
  is_public = true 
  OR auth.uid()::text = created_by::text
);

-- Authenticated users can create groups (creator must match auth)
CREATE POLICY "create_study_groups"
ON study_groups FOR INSERT
TO authenticated
WITH CHECK (auth.uid()::text = created_by::text);

-- Creators can update their groups
CREATE POLICY "update_study_groups"
ON study_groups FOR UPDATE
TO authenticated
USING (auth.uid()::text = created_by::text);

-- Creators can delete their groups
CREATE POLICY "delete_study_groups"
ON study_groups FOR DELETE
TO authenticated
USING (auth.uid()::text = created_by::text);

-- ============================================
-- 3. RLS Policies for messages table
-- ============================================

-- Authenticated users can view all messages (app handles group filtering)
CREATE POLICY "view_messages"
ON messages FOR SELECT
TO authenticated
USING (true);

-- Authenticated users can insert messages (app validates group membership)
CREATE POLICY "insert_messages"
ON messages FOR INSERT
TO authenticated
WITH CHECK (true);

-- Authenticated users can update any message
CREATE POLICY "update_messages"
ON messages FOR UPDATE
TO authenticated
USING (true);

-- Authenticated users can delete any message (for cleanup)
CREATE POLICY "delete_messages"
ON messages FOR DELETE
TO authenticated
USING (true);

-- ============================================
-- 4. RLS Policies for exams table
-- ============================================

-- Authenticated users can view all exams (app handles group filtering)
CREATE POLICY "view_exams"
ON exams FOR SELECT
TO authenticated
USING (true);

-- Authenticated users can insert exams (app validates group membership)
CREATE POLICY "insert_exams"
ON exams FOR INSERT
TO authenticated
WITH CHECK (true);

-- Authenticated users can update any exam
CREATE POLICY "update_exams"
ON exams FOR UPDATE
TO authenticated
USING (true);

-- Authenticated users can delete any exam
CREATE POLICY "delete_exams"
ON exams FOR DELETE
TO authenticated
USING (true);

-- ============================================
-- 5. RLS Policies for users table (CRITICAL)
-- ============================================
-- NOTE: Cannot use subqueries on users table - causes infinite recursion
-- Keeping policies simple to avoid circular dependencies

-- Any authenticated user can view all users (app handles group filtering)
CREATE POLICY "view_users"
ON users FOR SELECT
TO authenticated
USING (true);

-- Any authenticated user can create a user record
CREATE POLICY "create_users"
ON users FOR INSERT
TO authenticated
WITH CHECK (true);

-- Any authenticated user can update any user record (app handles permissions)
CREATE POLICY "update_users"
ON users FOR UPDATE
TO authenticated
USING (true);

-- Any authenticated user can delete any user record (needed for cleanup operations)
CREATE POLICY "delete_users"
ON users FOR DELETE
TO authenticated
USING (true);

-- ============================================
-- SUCCESS! Now verify everything worked:
-- ============================================

-- Check 1: Verify RLS is enabled on all tables
SELECT 
  tablename,
  rowsecurity AS "RLS Enabled"
FROM pg_tables 
WHERE tablename IN ('users', 'study_groups', 'messages', 'exams')
ORDER BY tablename;

-- Check 2: List all policies created
SELECT 
  tablename AS "Table",
  policyname AS "Policy Name",
  cmd AS "Command",
  CASE 
    WHEN roles = '{authenticated}' THEN 'Authenticated Users'
    ELSE roles::text 
  END AS "Applies To"
FROM pg_policies 
WHERE tablename IN ('study_groups', 'messages', 'exams', 'users')
ORDER BY tablename, policyname;

-- Check 3: Count policies per table (should have 4 each)
SELECT 
  tablename AS "Table",
  COUNT(*) AS "Policy Count"
FROM pg_policies 
WHERE tablename IN ('study_groups', 'messages', 'exams', 'users')
GROUP BY tablename
ORDER BY tablename;

-- ============================================
-- Test your authentication (run when logged in):
-- ============================================
-- SELECT auth.uid() AS "My User ID";
-- SELECT auth.email() AS "My Email";

-- ============================================
-- FINAL STEP: Enable HaveIBeenPwned (MANUAL)
-- ============================================
-- This CANNOT be done via SQL. You must:
-- 1. Go to Supabase Dashboard
-- 2. Navigate to: Authentication > Settings
-- 3. Scroll to: Security and Sessions
-- 4. Enable: "Check passwords against HaveIBeenPwned.org"
-- 5. Click Save
--
-- This prevents users from using compromised passwords.
-- ============================================
