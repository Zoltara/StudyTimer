# Supabase Security Fixes Guide

This guide explains how to fix the security issues identified in your Supabase project.

## Issues Identified

1. **HaveIBeenPwned Password Check**: Not enabled
2. **study_groups table**: Overly permissive RLS policy
3. **messages table**: Overly permissive RLS policy  
4. **exams table**: Overly permissive RLS policy

---

## How to Apply Fixes

### Step 1: Enable HaveIBeenPwned Password Check

This setting must be enabled through the Supabase Dashboard (cannot be done via SQL):

1. Go to your Supabase project dashboard
2. Navigate to **Authentication** → **Settings**
3. Scroll down to **Security and Sessions** section
4. Enable the option: **"Check passwords against HaveIBeenPwned.org"**
5. Click **Save**

This will prevent users from using compromised passwords when signing up or resetting passwords.

---

### Step 2: Apply SQL Security Fixes

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Click **New Query**
4. Open the file `supabase_security_fixes.sql` from this project
5. Copy the entire contents and paste it into the SQL Editor
6. Click **Run** to execute the script

This will:
- Remove all overly permissive "Allow all" policies
- Create proper Row Level Security (RLS) policies for each table
- Ensure users can only access data they're authorized to see

---

## What Changed

### Before (Insecure)
All tables had policies like:
```sql
-- INSECURE: Allows anyone to do anything
CREATE POLICY "Allow all" ON table_name
FOR ALL USING (true) WITH CHECK (true);
```

### After (Secure)
Each table now has specific policies based on user authentication and group membership:

#### study_groups
- ✅ Anyone can view **public** groups
- ✅ Authenticated users can view their own groups
- ✅ Authenticated users can create groups
- ✅ Only creators can update/delete their groups

#### messages
- ✅ Users can only view messages in groups they're members of
- ✅ Users can only insert messages in their own group
- ✅ Users can only update/delete their own messages

#### exams
- ✅ Users can only view exams in groups they're members of
- ✅ Users can only create exams in their own group
- ✅ Users can only update/delete their own exams

#### users
- ✅ Users can view other members in the same group
- ✅ Users can only create/update/delete their own user record

---

## Testing the Fixes

After applying the fixes, test the following scenarios:

### Test 1: Public Groups
- ✅ Unauthenticated users should see public groups in the browse list
- ❌ Unauthenticated users should NOT see private groups

### Test 2: Group Access
- ✅ Users should only see messages from groups they've joined
- ❌ Users should NOT be able to read messages from other groups

### Test 3: Data Modification
- ✅ Users should be able to update their own exams
- ❌ Users should NOT be able to modify other users' exams
- ✅ Group creators should be able to delete their groups
- ❌ Non-creators should NOT be able to delete groups

### Test 4: Password Security
- ✅ Sign up with a common password like "password123" should be rejected
- ✅ Strong unique passwords should be accepted

---

## Verification Queries

Run these in the Supabase SQL Editor to verify policies are applied:

```sql
-- Check all policies for each table
SELECT tablename, policyname, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename IN ('study_groups', 'messages', 'exams', 'users')
ORDER BY tablename, policyname;
```

You should see multiple specific policies per table instead of one "Allow all" policy.

---

## Important Notes

⚠️ **Backup First**: Before applying these fixes, consider backing up your database or testing in a development environment first.

⚠️ **Breaking Changes**: These changes make your security much tighter. Make sure your application code properly handles:
- Authentication (users must be signed in)
- Group membership (users must be in a group to access its data)
- Error handling for permission denied errors

✅ **Benefits**:
- Data privacy: Users can't spy on other groups
- Data integrity: Users can't modify data they don't own
- Compliance: Better security posture for user data
- Password security: Protection against compromised passwords

---

## Rollback (Emergency Only)

If something breaks and you need to temporarily rollback (NOT RECOMMENDED for production):

```sql
-- WARNING: This removes all security - use only for debugging
DROP POLICY IF EXISTS "Anyone can view public study groups" ON study_groups;
DROP POLICY IF EXISTS "Users can view their own groups" ON study_groups;
-- ... (drop all other policies)

-- Re-enable the permissive policy (INSECURE)
CREATE POLICY "temp_allow_all" ON study_groups FOR ALL USING (true) WITH CHECK (true);
-- Repeat for other tables if needed
```

**Better approach**: Fix the application code to work with proper security rather than removing security.

---

## Support

If you encounter issues after applying these fixes:

1. Check the browser console for authentication errors
2. Verify users are properly signed in before accessing data
3. Ensure the `auth.uid()` matches the `auth_id` in the users table
4. Check that group membership is properly established before accessing group data

For more information on Supabase Row Level Security:
- [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security)
- [Supabase Auth Helpers](https://supabase.com/docs/guides/auth/auth-helpers)
