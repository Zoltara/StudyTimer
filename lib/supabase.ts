import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables!');
  console.error('URL exists:', !!supabaseUrl);
  console.error('Key exists:', !!supabaseAnonKey);
} else {
  console.log('✅ Supabase configured:', { url: supabaseUrl.substring(0, 30) + '...' });
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

// Auth functions
export const signUp = async (email: string, password: string) => {
  try {
    const redirectUrl = typeof window !== 'undefined' ? window.location.origin : undefined;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
      },
    });
    if (error) {
      console.error('SignUp error:', error);
    }
    return { data, error };
  } catch (err) {
    console.error('SignUp exception:', err);
    return { data: null, error: err as any };
  }
};

export const signIn = async (email: string, password: string) => {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      console.error('SignIn error:', error);
    }
    return { data, error };
  } catch (err) {
    console.error('SignIn exception:', err);
    return { data: null, error: err as any };
  }
};

export const resetPassword = async (email: string) => {
  try {
    const redirectUrl = typeof window !== 'undefined' ? `${window.location.origin}?auth=reset` : undefined;
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl,
    });
    if (error) {
      console.error('Reset password error:', error);
    }
    return { data, error };
  } catch (err) {
    console.error('Reset password exception:', err);
    return { data: null, error: err as any };
  }
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  return { error };
};

export const getCurrentUser = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
};

export type StudyGroup = {
  id: string;
  code: string;
  name: string;
  topic: string;
  created_by: string;
  is_public: boolean;
  created_at: string;
  updated_at?: string;
};

export type User = {
  id: string;
  auth_id: string;
  name: string;
  group_id: string | null;
  status: 'online' | 'focus' | 'break' | 'offline';
  streak: number;
  sessions_today: number;
  created_at: string;
  updated_at?: string;
};

export type Message = {
  id: string;
  user_id: string;
  user_name: string;
  group_id: string | null;
  text: string;
  is_system: boolean;
  created_at: string;
};

export type Exam = {
  id: string;
  user_id: string;
  group_id: string | null;
  name: string;
  date: string;
  created_at: string;
};

export type Friend = {
  id: string;
  user_id: string;
  friend_id: string;
  created_at: string;
};

// Generate a unique 6-character group code
export const generateGroupCode = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};
