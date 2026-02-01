'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, User, Message as DbMessage, Exam as DbExam, StudyGroup, generateGroupCode, signUp, signIn, signOut, resetPassword, getCurrentUser } from '../lib/supabase';
import { realtimeManager } from '../lib/realtime-manager';

// Audio file paths
const AUDIO_FILES = {
  start: '/audio/Pomodoro start.wav',
  ticking: '/audio/Pomodoro clock ticking.mp3',
  shortBreak: '/audio/Pomodoro  break.wav',
  longBreak: '/audio/Pomodoro long break.wav',
  notification: '/audio/notification.mp3',
};

// Audio manager for handling sounds
class AudioManager {
  private tickingAudio: HTMLAudioElement | null = null;
  
  playSound(src: string) {
    if (typeof window === 'undefined') return;
    try {
      const audio = new Audio(src);
      audio.volume = 0.5;
      audio.play().catch(e => console.log('Audio play failed:', e));
    } catch (e) {
      console.log('Audio not supported');
    }
  }

  playNotification() {
    if (typeof window === 'undefined') return;
    try {
      const audio = new Audio('/audio/AtomAppear.mp3');
      audio.volume = 0.7;
      audio.play().catch(e => console.log('Audio play failed:', e));
    } catch (e) {
      console.log('Audio not supported');
    }
  }
  
  startTicking() {
    if (typeof window === 'undefined') return;
    this.stopTicking();
    try {
      this.tickingAudio = new Audio(AUDIO_FILES.ticking);
      this.tickingAudio.loop = true;
      this.tickingAudio.volume = 0.3;
      this.tickingAudio.play().catch(e => console.log('Ticking audio failed:', e));
    } catch (e) {
      console.log('Ticking audio not supported');
    }
  }
  
  stopTicking() {
    if (this.tickingAudio) {
      this.tickingAudio.pause();
      this.tickingAudio.currentTime = 0;
      this.tickingAudio = null;
    }
  }
  
  focusStart() {
    this.playSound(AUDIO_FILES.start);
  }
  
  focusComplete() {
    this.stopTicking();
    this.playSound(AUDIO_FILES.shortBreak);
  }
  
  shortBreak() {
    this.stopTicking();
    this.playSound(AUDIO_FILES.shortBreak);
  }
  
  longBreak() {
    this.stopTicking();
    this.playSound(AUDIO_FILES.longBreak);
  }
}

// Singleton audio manager
let audioManager: AudioManager | null = null;
const getAudioManager = () => {
  if (typeof window !== 'undefined' && !audioManager) {
    audioManager = new AudioManager();
  }
  return audioManager;
};

type TimerState = 'idle' | 'focus' | 'break' | 'lostInBreak';

interface Message {
  id: string;
  user: string;
  text: string;
  isSystem: boolean;
  timestamp: Date;
}

interface Friend {
  id: string;
  name: string;
  status: 'online' | 'focus' | 'break' | 'offline';
  streak: number;
  lastSeen?: Date;
}

interface Exam {
  id: string;
  name: string;
  date: Date;
}

interface TimerSettings {
  focusTime: number;
  shortBreakTime: number;
  longBreakTime: number;
  cyclesBeforeLongBreak: number;
}

const DEFAULT_SETTINGS: TimerSettings = {
  focusTime: 25,
  shortBreakTime: 3,
  longBreakTime: 10,
  cyclesBeforeLongBreak: 3,
};

// Circular Progress Bar Component
function CircularProgress({
  progress,
  size = 200,
  strokeWidth = 12,
  timerState,
  children,
}: {
  progress: number;
  size?: number;
  strokeWidth?: number;
  timerState: TimerState;
  children: React.ReactNode;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - progress * circumference;

  const getColor = () => {
    switch (timerState) {
      case 'focus':
        return '#10b981'; // emerald-500
      case 'break':
        return '#eab308'; // yellow-500
      case 'lostInBreak':
        return '#ef4444'; // red-500
      default:
        return '#3f3f46'; // zinc-700
    }
  };

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#27272a"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={getColor()}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            transition: 'stroke 0.3s ease',
          }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

export default function Home() {
  return <StudyTimer />;
}

function StudyTimer() {
  // Add missing state declarations to prevent undefined errors
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // ...state declarations...

  const [userName, setUserName] = useState('');
  const [nameError, setNameError] = useState('');
  const [existingUserId, setExistingUserId] = useState<string | null>(null);
  const [showNameConfirm, setShowNameConfirm] = useState(false);
  const [isNameSet, setIsNameSet] = useState(false);
  const [seconds, setSeconds] = useState(DEFAULT_SETTINGS.focusTime * 60);
  const [timerState, setTimerState] = useState<TimerState>('idle');
  const [sessionsCompleted, setSessionsCompleted] = useState(0);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [cycleCount, setCycleCount] = useState(0);

  // Group state
  const [currentGroup, setCurrentGroup] = useState<StudyGroup | null>(null);
  const [groupScreen, setGroupScreen] = useState<'select' | 'create' | 'join' | 'lobby' | 'browse'>('select');
  const [groupName, setGroupName] = useState('');
  const [groupTopic, setGroupTopic] = useState('');
  const [isPublicGroup, setIsPublicGroup] = useState(true);
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [createError, setCreateError] = useState('');
  const [publicGroups, setPublicGroups] = useState<StudyGroup[]>([]);
  const [showGroupCode, setShowGroupCode] = useState(false);
  const [isGroupCreator, setIsGroupCreator] = useState(false);
  const [useSyncedTimer, setUseSyncedTimer] = useState(true); // Whether non-creators sync with creator's timer

  // Auth state
  const [user, setUser] = useState<any>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Restore user session on mount
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setUser(session.user);
          console.log('Session restored:', session.user.email);
        }
      } catch (e) {
        console.log('Error restoring session:', e);
      }
    };
    restoreSession();
  }, []);
  const [authMode, setAuthMode] = useState<'signin' | 'signup' | 'reset'>('signin');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);

  // Always set creator rights if user.id matches currentGroup.created_by
  useEffect(() => {
    if (currentGroup && user && currentGroup.created_by === user.id) {
      setIsGroupCreator(true);
    } else {
      setIsGroupCreator(false);
    }
  }, [currentGroup, user]);

  // Helper to attach creator's display name to a group object
  const attachCreatorName = async (group: any) => {
    if (!group || !group.created_by) return group;
    try {
      const { data } = await supabase.from('users').select('name').eq('auth_id', group.created_by);
      const creatorName = data && data.length > 0 ? data[0].name : group.created_by;
      return { ...group, created_by_name: creatorName };
    } catch (e) {
      return { ...group, created_by_name: group.created_by };
    }
  };

  // Timer settings
  const [settings, setSettings] = useState<TimerSettings>(DEFAULT_SETTINGS);
  const [editingSettings, setEditingSettings] = useState(false);
  const [tempSettings, setTempSettings] = useState<TimerSettings>(DEFAULT_SETTINGS);
  const [settingsWarning, setSettingsWarning] = useState<string | null>(null);

  // Smooth progress for circular bar
  const [smoothProgress, setSmoothProgress] = useState(1);
  const lastTickRef = useRef<number>(Date.now());
  const animationFrameRef = useRef<number | null>(null);
  
  // Channel ref for broadcasting settings/timer changes
  const settingsChannelRef = useRef<any>(null);

  // Cleanup realtime connections on unmount
  useEffect(() => {
    return () => {
      realtimeManager.removeAllChannels();
      getAudioManager()?.stopTicking();
    };
  }, []);

  // Always scroll to top when main screen changes
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [groupScreen]);

  // Check auth state on mount
  useEffect(() => {
    const checkUser = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        setUser(data.user ?? null);
      } catch (e) {
        setUser(null);
      }
    };
    checkUser();

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) setShowAuth(false);
    });

    return () => {
      try {
        data.subscription.unsubscribe();
      } catch (e) {
        // ignore
      }
    };
  }, []);

  // URL fallback: open auth UI if ?auth=1 or ?auth=signin is present
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const authParam = params.get('auth');
    if (authParam === '1' || authParam === 'signin') {
      setAuthMode('signin');
      setShowAuth(true);
    }
  }, []);

  // Add listener for external auth events (for backward compatibility)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const openHandler = (e: any) => {
      console.log('openStudyTimerAuth event received', e?.detail);
      setAuthMode(e?.detail?.mode || 'signin');
      setShowAuth(true);
    };
    window.addEventListener('openStudyTimerAuth', openHandler as EventListener);

    return () => {
      window.removeEventListener('openStudyTimerAuth', openHandler as EventListener);
    };
  }, []);

  // Chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [chatSoundEnabled, setChatSoundEnabled] = useState(true);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat to bottom when new messages arrive
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // Friends state
  const [friends, setFriends] = useState<Friend[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);

  // Exams state
  const [exams, setExams] = useState<Exam[]>([]);
  const [newExamName, setNewExamName] = useState('');
  const [newExamDate, setNewExamDate] = useState('');
  const [editingExam, setEditingExam] = useState<string | null>(null);
  const [editExamName, setEditExamName] = useState('');
  const [editExamDate, setEditExamDate] = useState('');

  // Study target state
  const [studyTarget, setStudyTarget] = useState<string>('');
  const [editingTarget, setEditingTarget] = useState(false);

  // Calculate total time for progress
  const getTotalTime = () => {
    if (timerState === 'focus') return settings.focusTime * 60;
    if (timerState === 'break') {
      return cycleCount > 0 && cycleCount % settings.cyclesBeforeLongBreak === 0
        ? settings.longBreakTime * 60
        : settings.shortBreakTime * 60;
    }
    return settings.focusTime * 60;
  };

  // Use smoothProgress for continuous animation, seconds for display
  const progress = timerState === 'idle' ? 1 : smoothProgress;

  // Polling fallback for when real-time fails
  useEffect(() => {
    if (!currentUser || !currentGroup) return;
    
    const pollForMessages = async () => {
      try {
        const { data } = await supabase
          .from('messages')
          .select('*')
          .eq('group_id', currentGroup.id)
          .order('created_at', { ascending: true })
          .limit(100);
          
        if (data) {
          setMessages(data.map((m: DbMessage) => ({
            id: m.id,
            user: m.user_name,
            text: m.text,
            isSystem: m.is_system,
            timestamp: new Date(m.created_at),
          })));
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    };
    
    // Poll immediately and every 1 second
    pollForMessages();
    const interval = setInterval(pollForMessages, 1000);
    
    return () => clearInterval(interval);
  }, [currentUser, currentGroup]);

  // Load initial data and set up realtime subscriptions
  useEffect(() => {
    if (!currentUser || !currentGroup) return;

    // Load messages for this group
    const loadMessages = async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('group_id', currentGroup.id)
        .order('created_at', { ascending: false })
        .limit(100);

      if (data) {
        setMessages(
          data.map((m: DbMessage) => ({
            id: m.id,
            user: m.user_name,
            text: m.text,
            isSystem: m.is_system,
            timestamp: new Date(m.created_at),
          }))
        );
      }
    };

    // Load all users in this group
    const loadUsers = async () => {
      const { data } = await supabase
        .from('users')
        .select('*')
        .eq('group_id', currentGroup.id)
        .order('created_at', { ascending: true });
      if (data && data.length > 0) {
        // Filter out users offline for more than 10 minutes
        const now = new Date();
        const activeUsers = data.filter((u: User & { updated_at?: string }) => {
          if (u.id === currentUser.id) return false;
          if (u.name === userName) return false; // Filter out users with same name as current user
          if (u.status !== 'offline') return true;
          const updatedAt = new Date(u.updated_at || u.created_at);
          const minutesOffline = (now.getTime() - updatedAt.getTime()) / (1000 * 60);
          return minutesOffline < 10;
        });
        
        // Remove duplicate names, keeping the most recently updated user
        const uniqueByName = activeUsers.reduce((acc: (User & { updated_at?: string })[], user: User & { updated_at?: string }) => {
          const existingIndex = acc.findIndex(u => u.name === user.name);
          if (existingIndex === -1) {
            acc.push(user);
          } else {
            // Keep the more recently updated one
            const existingUpdated = new Date(acc[existingIndex].updated_at || acc[existingIndex].created_at);
            const currentUpdated = new Date(user.updated_at || user.created_at);
            if (currentUpdated > existingUpdated) {
              acc[existingIndex] = user;
            }
          }
          return acc;
        }, []);
        
        setAllUsers(uniqueByName);
        setFriends(
          uniqueByName.map((u: User & { updated_at?: string }) => ({
            id: u.id,
            name: u.name,
            status: u.status,
            streak: u.streak,
            lastSeen: new Date(u.updated_at || u.created_at),
          }))
        );
      }
    };

    // Load exams for this group
    const loadExams = async () => {
      const { data } = await supabase.from('exams').select('*').eq('group_id', currentGroup.id);
      if (data && data.length > 0) {
        const loadedExams = data.map((e: DbExam) => ({
          id: e.id,
          name: e.name,
          date: new Date(e.date),
        }));
        setExams(loadedExams);
        // Save to localStorage as backup
        localStorage.setItem(`exams_${currentGroup.id}`, JSON.stringify(loadedExams.map(e => ({ ...e, date: e.date.toISOString() }))));
      } else {
        // Try loading from localStorage as fallback
        const stored = localStorage.getItem(`exams_${currentGroup.id}`);
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            setExams(parsed.map((e: { id: string; name: string; date: string }) => ({ ...e, date: new Date(e.date) })));
          } catch (e) {
            console.log('Failed to parse stored exams');
          }
        }
      }
    };

    loadMessages();
    loadUsers();
    loadExams();

    // Real-time disabled - using polling only
    console.log('📊 Using polling for group:', currentGroup.id);

    return () => {
      // No channels to cleanup - using polling only
    };

  }, [currentUser, currentGroup]);

  const addExam = async () => {
    if (!newExamName.trim() || !newExamDate || !currentUser || !currentGroup) return;

    const tempExamId = `temp-${Date.now()}`;
    const newExam = { 
      id: tempExamId, 
      name: newExamName, 
      date: new Date(newExamDate) 
    };

    // Immediately add to UI (optimistic update)
    setExams((prev) => [...prev, newExam]);
    
    setNewExamName('');
    setNewExamDate('');

    try {
      const { data, error } = await supabase
        .from('exams')
        .insert({
          user_id: currentUser.id,
          group_id: currentGroup.id,
          name: newExamName,
          date: newExamDate,
        })
        .select()
        .single();

      if (data && !error) {
        // Replace temporary exam with real data from database
        setExams((prev) => 
          prev.map(e => 
            e.id === tempExamId ? { id: data.id, name: data.name, date: new Date(data.date) } : e
          )
        );
        
        console.log('Exam added successfully:', data);
        
        // Optimistically update leaderboard
        const updatedExams = exams.map(e => e.id === tempExamId ? { id: data.id, name: data.name, date: new Date(data.date) } : e);
        updateLeaderboard(allUsers, updatedExams);
      } else {
        console.error('Error adding exam:', error);
        // Remove the temporary exam on error
        setExams((prev) => prev.filter(e => e.id !== tempExamId));
        alert('Failed to add exam. Please try again.');
      }
    } catch (error) {
      console.error('Error adding exam:', error);
      setExams((prev) => prev.filter(e => e.id !== tempExamId));
      alert('Failed to add exam. Please try again.');
    }
  };

  const deleteExam = async (examId: string) => {
    if (!currentUser || !currentGroup) return;

    // Optimistically remove from UI first
    setExams((prev) => prev.filter(e => e.id !== examId));

    try {
      const { error } = await supabase.from('exams').delete().eq('id', examId);
      
      if (error) {
        console.error('Error deleting exam:', error);
        alert('Failed to delete exam. Please try again.');
      }
    } catch (error) {
      console.error('Error deleting exam:', error);
      alert('Failed to delete exam. Please try again.');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent, action: () => void) => {
    if (e.key === 'Enter') {
      action();
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !currentUser || !currentGroup) return;

    const messageText = newMessage.trim();
    
    console.log('🔴 SENDING MESSAGE:', { 
      messageText, 
      userName, 
      groupId: currentGroup.id,
      userId: currentUser.id 
    });
    
    setNewMessage('');

    try {
      // Insert message into database - NO optimistic updates, let subscription handle everything
      const { data, error } = await supabase.from('messages').insert({
        user_id: currentUser.id,
        user_name: userName,
        group_id: currentGroup.id,
        text: messageText,
        is_system: false,
      }).select().single();

      if (error) {
        console.error('❌ MESSAGE SEND FAILED:', error);
        alert('Failed to send message. Please try again.');
      } else {
        console.log('✅ MESSAGE SENT TO DATABASE:', data);
        console.log('🔄 Waiting for subscription to trigger...');
        // Message will appear via subscription for ALL users including sender
      }
    } catch (err) {
      console.error('❌ MESSAGE SEND ERROR:', err);
      alert('Failed to send message. Please try again.');
    }
  };

  // Simplified app without broken subscriptions
  if (!currentUser || !currentGroup) {
    return <div>Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-black text-white p-4">
      <h1>Study Timer App</h1>
      <p>Messages update every 1 second via polling</p>
      
      <div className="mt-4 bg-zinc-900 p-4 rounded">
        <h2>Messages ({messages.length})</h2>
        {messages.map((msg) => (
          <div key={msg.id} className="p-2 border-b border-zinc-700">
            <strong>{msg.user}:</strong> {msg.text}
          </div>
        ))}
        
        <div className="mt-4 flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => handleKeyPress(e, sendMessage)}
            className="flex-1 p-2 rounded bg-zinc-800 text-white"
            placeholder="Type a message..."
          />
          <button
            onClick={sendMessage}
            className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-700"
          >
            Send
          </button>
          <button
            onClick={testRealTime}
            className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-700 text-xs"
            title="Test real-time (check console)"
          >
            Test RT
          </button>
        </div>
      </div>
    </div>
  );
}
