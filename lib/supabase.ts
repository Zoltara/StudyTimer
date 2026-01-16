import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type StudyGroup = {
  id: string;
  code: string;
  name: string;
  topic: string;
  created_by: string;
  is_public: boolean;
  created_at: string;
};

export type User = {
  id: string;
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
