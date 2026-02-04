# Deployment Guide

## Recent Fixes (Feb 4, 2026)

### ✅ Duplicate Prevention
- **No duplicate names** - Users cannot choose a name that's already taken in the same study group
- **No duplicate emails** - Email validation prevents multiple accounts with the same email
- **Better error messages** - Clear feedback when a name/email is already in use

### ✅ Message Sending
1. **Added proper environment variable validation** - The app now checks if Supabase credentials are present
2. **Added detailed error logging** - Messages will show in console if they fail to send
3. **Added authentication check** - Users must be signed in before creating a profile

## For Local Development

1. Make sure `.env.local` exists with your Supabase credentials:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```

2. Restart the development server:
   ```bash
   npm run dev
   ```

3. Open the browser console (F12) to see detailed logs about message sending

## For Vercel Deployment

### Step 1: Add Environment Variables to Vercel

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add the following variables:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://fmiilqnvseqpzihpoqbe.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtaWlscW52c2VxcHppaHBvcWJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1MDE0ODAsImV4cCI6MjA4NDA3NzQ4MH0.rmQHlX7eqPbKJYxwA4NUMm9-GtrdF1fyW8YNoyPSrFA`

4. Make sure to select **All Environments** (Production, Preview, Development)

### Step 2: Redeploy

After adding the environment variables, trigger a new deployment:
- Option A: Push a new commit to your Git repository
- Option B: Go to Deployments → Click the three dots on the latest deployment → Redeploy

### Step 3: Verify

1. Open your deployed app in Vercel
2. Open the browser console (F12)
3. Try to send a message
4. Check the console for any error messages

## Troubleshooting

### Duplicate Names or Emails

**Symptom**: Getting an error that a name or email is already taken

**Solutions**:

**For Names:**
- Each study group has unique names - you can't use a name someone else is using in the same group
- You CAN use the same name in different groups
- If you see "This name is already taken", try adding your last initial or a number (e.g., "John S" or "John2")
- If it's YOUR name from a previous session, click "Yes, that's me!" when prompted

**For Emails:**
- Each email can only have one account
- If you get "This email is already registered", use the Sign In button instead
- Use the "Forgot Password" link if you don't remember your password
- Make sure you're not accidentally trying to create a second account

### Messages not sending

**Symptom**: Message input clears but message doesn't appear in chat

**Solution**: Check browser console for errors. Common issues:
1. **Not signed in** - You must sign in first (button in top right)
2. **No user profile** - After signing in and joining a group, enter your name
3. **Supabase connection error** - Check that environment variables are set correctly

**How to test**:
1. Sign in using the "Sign In" button (top right)
2. Create or join a study group
3. Enter your name and click "Join & Start Studying"
4. Try sending a message
5. Check the browser console - you should see:
   ```
   sendMessage called {hasMessage: true, hasCurrentUser: true, hasCurrentGroup: true, ...}
   Message broadcasted successfully
   Message persisted to DB successfully
   ```

### Environment variables not working

**Symptom**: Console shows "Missing Supabase environment variables!"

**Solution**: 
- **Local**: Check that `.env.local` exists and has the correct values
- **Vercel**: Verify environment variables are added in Vercel dashboard and redeploy

### Authentication not working

**Symptom**: "Please sign in first" error when trying to join a group

**Solution**:
1. Make sure Supabase authentication is enabled
2. Check that email confirmation is not required (or confirm your email)
3. Try signing up with a new email address
4. Check Supabase dashboard for authentication errors

## Key Changes Made

### lib/supabase.ts
- Added validation for environment variables
- Added console warnings if credentials are missing

### app/page.tsx
- Added extensive logging to `sendMessage` function
- Added user authentication check in `createNewUser` function
- Added helpful error messages for users

## Next Steps

1. Test locally with the browser console open
2. Add environment variables to Vercel
3. Redeploy the application
4. Test on Vercel with browser console open
