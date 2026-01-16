import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type User = {
  id: string;
  name: string;
  status: 'online' | 'focus' | 'break' | 'offline';
  streak: number;
  sessions_today: number;
  created_at: string;
};

export type Message = {
  id: string;
  user_id: string;
  user_name: string;
  text: string;
  is_system: boolean;
  created_at: string;
};

export type Exam = {
  id: string;
  user_id: string;
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
