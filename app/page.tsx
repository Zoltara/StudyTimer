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
  const [currentUser, setCurrentUser] = useState<User | null>(null);


  // ...existing state declarations...

  // ...state declarations...

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
    
    // Poll every 2 seconds
    const interval = setInterval(pollForMessages, 2000);
    
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

    // Subscribe to new messages for this group - MAXIMUM SIMPLICITY
    console.log('🔴 SETTING UP MESSAGE SUBSCRIPTION FOR GROUP:', currentGroup.id);
    const messagesChannel = supabase
      .channel(`messages-${currentGroup.id}`)
      .on(
        'postgres_changes',
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'messages', 
          filter: `group_id=eq.${currentGroup.id}` 
        },
        (payload) => {
          console.log('🔴 MESSAGE SUBSCRIPTION TRIGGERED 🔴');
          console.log('Raw payload:', payload);
          console.log('Event type:', payload.eventType);
          console.log('Schema:', payload.schema);
          console.log('Table:', payload.table);
          console.log('Current user:', userName);
          console.log('Current group ID:', currentGroup.id);
          
          const m = payload.new as DbMessage;
          console.log('Parsed message data:', m);
          
          // Only process messages for this group
          if (m.group_id !== currentGroup.id) {
            console.log('❌ WRONG GROUP - Message is for group', m.group_id, 'but we are in group', currentGroup.id);
            return;
          }
          
          console.log('✅ CORRECT GROUP - Processing message for all users');
          console.log('Message details:', {
            messageId: m.id,
            from: m.user_name,
            text: m.text,
            currentUser: userName,
            isFromCurrentUser: m.user_name === userName
          });
          
          // Simple approach: Add ALL messages for ALL users, let duplicate check handle it
          setMessages((prev) => {
            console.log('Current messages count before adding:', prev.length);
            
            // Check for duplicates by ID only
            if (prev.some(msg => msg.id === m.id)) {
              console.log('⚠️ Message already exists, skipping duplicate:', m.id);
              return prev;
            }
            
            const newMessage = {
              id: m.id,
              user: m.user_name,
              text: m.text,
              isSystem: m.is_system,
              timestamp: new Date(m.created_at),
            };
            
            console.log('✅ ADDING NEW MESSAGE TO UI:', newMessage);
            console.log('New messages count will be:', prev.length + 1);
            
            // Play sound for messages from others
            if (!m.is_system && chatSoundEnabled && m.user_name !== userName) {
              console.log('🔊 Playing notification sound for message from:', m.user_name);
              getAudioManager()?.playNotification();
            }
            
            // Add and sort
            const updatedMessages = [...prev, newMessage].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
            console.log('Messages after sorting:', updatedMessages.length, 'total');
            return updatedMessages;
          });
        }
      )
      .on(
        'postgres_changes',
        { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'messages', 
          filter: `group_id=eq.${currentGroup.id}` 
        },
        (payload) => {
          const m = payload.new as DbMessage;
          if (m.group_id !== currentGroup.id) return;
          
          setMessages((prev) => prev.map(msg => 
            msg.id === m.id 
              ? { ...msg, text: m.text, timestamp: new Date(m.created_at) }
              : msg
          ));
        }
      )
      .on(
        'postgres_changes',
        { 
          event: 'DELETE', 
          schema: 'public', 
          table: 'messages' 
        },
        (payload) => {
          const deletedId = payload.old?.id;
          if (deletedId) {
            setMessages((prev) => prev.filter(msg => msg.id !== deletedId));
          }
        }
      )
      .subscribe((status, err) => {
        console.log('🔴 MESSAGES CHANNEL STATUS:', status, 'for group:', currentGroup.id, 'user:', userName);
        if (status === 'SUBSCRIBED') {
          console.log('✅ Messages channel subscribed successfully for group:', currentGroup.id);
        }
        if (status === 'CHANNEL_ERROR') {
          console.error('❌ Messages channel error:', err);
        }
        if (status === 'TIMED_OUT') {
          console.warn('⏰ Messages channel timed out, attempting to reconnect...');
        }
        if (status === 'CLOSED') {
          console.log('🔒 Messages channel closed');
        }
      });

    // Subscribe to user status changes for this group with enhanced real-time updates
    const usersChannel = supabase
      .channel(`users-${currentGroup.id}`, {
        config: {
          broadcast: { self: false },
          presence: { key: currentUser.id },
        },
      })
      .on(
        'postgres_changes',
        { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'users', 
          filter: `group_id=eq.${currentGroup.id}` 
        },
        (payload) => {
          const u = payload.new as User;
          if (u.id !== currentUser.id && u.group_id === currentGroup.id) {
            // Real-time update for friends list
            setFriends((prev) =>
              prev.map((f) =>
                f.id === u.id 
                  ? { ...f, status: u.status, streak: u.streak, lastSeen: new Date() } 
                  : f
              )
            );
            
            // Real-time update for all users
            setAllUsers((prev) => prev.map((user) => (user.id === u.id ? u : user)));
            
            // Show status change notification for important status changes
            if (u.status === 'focus') {
              setMessages((prev) => [...prev, {
                id: `status-${u.id}-${Date.now()}`,
                user: 'System',
                text: `🔥 ${u.name} started focusing!`,
                isSystem: true,
                timestamp: new Date(),
              }]);
            } else if (u.status === 'break') {
              setMessages((prev) => [...prev, {
                id: `status-${u.id}-${Date.now()}`,
                user: 'System',
                text: `☕ ${u.name} is on a break`,
                isSystem: true,
                timestamp: new Date(),
              }]);
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'users', 
          filter: `group_id=eq.${currentGroup.id}` 
        },
        (payload) => {
          const u = payload.new as User;
          if (u.id !== currentUser.id && u.group_id === currentGroup.id && u.name !== userName) {
            // Add new user to friends list (avoid duplicate IDs and names) with real-time updates
            setFriends((prev) => {
              if (prev.some(f => f.id === u.id || f.name === u.name)) return prev;
              return [...prev, {
                id: u.id,
                name: u.name,
                status: u.status,
                streak: u.streak,
                lastSeen: new Date(u.created_at),
              }];
            });
            
            setAllUsers((prev) => {
              if (prev.some(user => user.id === u.id || user.name === u.name)) return prev;
              return [...prev, u];
            });
            
            // Add welcome message in real-time
            setMessages((prev) => [...prev, {
              id: `welcome-${u.id}-${Date.now()}`,
              user: 'System',
              text: `👋 ${u.name} joined the study group!`,
              isSystem: true,
              timestamp: new Date(),
            }]);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'users' },
        (payload) => {
          const deletedId = payload.old?.id;
          const deletedName = payload.old?.name;
          if (deletedId) {
            setFriends((prev) => prev.filter(f => f.id !== deletedId));
            setAllUsers((prev) => prev.filter(u => u.id !== deletedId));
            
            // Add goodbye message in real-time
            if (deletedName) {
              setMessages((prev) => [...prev, {
                id: `goodbye-${deletedId}-${Date.now()}`,
                user: 'System',
                text: `👋 ${deletedName} left the group`,
                isSystem: true,
                timestamp: new Date(),
              }]);
            }
          }
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log('Users channel subscribed successfully');
        }
        if (status === 'CHANNEL_ERROR') {
          console.error('Users channel error:', err);
        }
        if (status === 'TIMED_OUT') {
          console.warn('Users channel timed out, attempting to reconnect...');
        }
      });

    // Subscribe to timer settings and state changes (broadcast)
    const settingsChannel = supabase
      .channel(`settings-${currentGroup.id}`, {
        config: {
          broadcast: { self: false },
          presence: { key: currentUser.id },
        },
      })
      .on('broadcast', { event: 'settings-change' }, (payload) => {
        const { settings: newSettings, changedById, changedByName } = payload.payload as {
          settings: TimerSettings;
          changedById?: string;
          changedByName?: string;
        };
        // Only update settings if it's from someone else
        if (changedById !== user?.id) {
          // Only apply settings if non-creator AND using synced timer
          if (!isGroupCreator && useSyncedTimer) {
            setSettings(newSettings);
            if (timerState === 'idle') {
              setSeconds(newSettings.focusTime * 60);
            }
          }
          // Show notification to everyone
          const suffix = !isGroupCreator && !useSyncedTimer ? ' (you are using own timer)' : '';
          setSettingsWarning(`⚠️ Timer Changed by ${changedByName || 'group member'}${suffix}`);
          // Auto-hide warning after 5 seconds
          setTimeout(() => setSettingsWarning(null), 5000);
        }
      })
      .on('broadcast', { event: 'timer-sync' }, (payload) => {
        const { timerState: newTimerState, seconds: newSeconds, cycleCount: newCycleCount, changedById, changedByName } = payload.payload as {
          timerState: TimerState;
          seconds: number;
          cycleCount: number;
          changedById?: string;
          changedByName?: string;
        };
        // Sync timer from group creator (only for non-creators who chose to sync)
        if (changedById !== user?.id && !isGroupCreator && useSyncedTimer) {
          const audio = getAudioManager();
          const prevTimerState = timerState;

          setTimerState(newTimerState);
          setSeconds(newSeconds);
          if (newCycleCount !== undefined) setCycleCount(newCycleCount);

          // Play audio when state changes
          if (prevTimerState !== newTimerState) {
            if (newTimerState === 'focus') {
              audio?.focusStart();
              setTimeout(() => audio?.playSound(AUDIO_FILES.ticking), 500);
              setSettingsWarning(`🚀 ${changedByName || 'Someone'} started a focus session!`);
            } else if (newTimerState === 'break') {
              audio?.stopTicking();
              audio?.shortBreak();
              setSettingsWarning(`☕ ${changedByName || 'Someone'} started a break!`);
            } else if (newTimerState === 'idle') {
              audio?.stopTicking();
              setSettingsWarning(`⏹️ ${changedByName || 'Someone'} ended the session`);
            } else if (newTimerState === 'lostInBreak') {
              audio?.stopTicking();
              setSettingsWarning(`⚠️ ${changedByName || 'Someone'} lost in break!`);
            }
            setTimeout(() => setSettingsWarning(null), 3000);
          }
        }
      })
      .on('broadcast', { event: 'timer-tick' }, (payload) => {
        const { seconds: newSeconds, timerState: newTimerState } = payload.payload as {
          seconds: number;
          timerState: TimerState;
        };
        // Continuous timer sync for non-creators who chose to sync
        if (!isGroupCreator && useSyncedTimer) {
          setSeconds(newSeconds);
          setTimerState(newTimerState);
        }
      })
      .on('broadcast', { event: 'exam-update' }, (payload) => {
        // Reload exams when someone adds/updates/deletes one with optimistic updates
        const { action, exam: examData, userId } = payload.payload as {
          action?: 'add' | 'update' | 'delete';
          exam?: any;
          userId?: string;
        };
        
        // Skip if this is from the current user (already updated optimistically)
        if (userId === currentUser?.id) return;
        
        if (action && examData) {
          // Real-time update for other users
          if (action === 'add') {
            setExams((prev) => {
              // Avoid duplicates
              if (prev.some(e => e.id === examData.id)) return prev;
              return [...prev, {
                id: examData.id,
                name: examData.name,
                date: new Date(examData.date),
              }];
            });
          } else if (action === 'update') {
            setExams((prev) => prev.map(e => 
              e.id === examData.id 
                ? { ...e, name: examData.name, date: new Date(examData.date) }
                : e
            ));
          } else if (action === 'delete') {
            setExams((prev) => prev.filter(e => e.id !== examData.id));
          }
        }
        
        // Then reload from database to ensure consistency (with delay to show optimistic update first)
        setTimeout(async () => {
          try {
            const { data, error } = await supabase
              .from('exams')
              .select('*')
              .eq('group_id', currentGroup.id)
              .order('date', { ascending: true });
            
            if (data && !error) {
              setExams(data.map((e: DbExam) => ({
                id: e.id,
                name: e.name,
                date: new Date(e.date),
              })));
            }
          } catch (err) {
            console.error('Error reloading exams:', err);
          }
        }, 100);
      })
      .on('broadcast', { event: 'leaderboard-update' }, (payload) => {
        const { userId, userName: updatedUserName, newStreak, status } = payload.payload as {
          userId: string;
          userName: string;
          newStreak: number;
          status: string;
        };
        
        // Update the friends list with new streak immediately
        if (userId !== currentUser.id) {
          setFriends((prev) => prev.map((f) =>
            f.name === updatedUserName 
              ? { ...f, streak: newStreak, status: status as any }
              : f
          ));
          
          // Show streak achievement message for significant milestones
          if (newStreak > 0 && newStreak % 5 === 0) {
            setMessages((prev) => [...prev, {
              id: `streak-${userId}-${Date.now()}`,
              user: 'System',
              text: `🔥 ${updatedUserName} reached ${newStreak} session streak! Amazing! 🎉`,
              isSystem: true,
              timestamp: new Date(),
            }]);
          }
        }
      })
      .on('broadcast', { event: 'group-deleted' }, (payload) => {
        const { groupName, deletedBy } = payload.payload as {
          groupName: string;
          deletedBy: string;
        };
        // Group was deleted by creator - redirect all members
        getAudioManager()?.stopTicking();
        alert(`The study group "${groupName}" was deleted by ${deletedBy}.`);
        
        // Reset all state
        setCurrentUser(null);
        setCurrentGroup(null);
        setIsNameSet(false);
        setGroupScreen('select');
        setFriends([]);
        setAllUsers([]);
        setMessages([]);
        setExams([]);
        setTimerState('idle');
        setSeconds(DEFAULT_SETTINGS.focusTime * 60);
        setCurrentStreak(0);
        setSessionsCompleted(0);
        setCycleCount(0);
        setStudyTarget('');
        setIsGroupCreator(false);
        setUseSyncedTimer(true);
      })
      .subscribe((status) => {
        console.log('🔴 MESSAGES SUBSCRIPTION STATUS:', status, 'for group:', currentGroup.id);
      });
    
    // Store the channel ref for broadcasting
    settingsChannelRef.current = settingsChannel;

    // Enhanced presence tracking for real-time user activity
    const presenceChannel = supabase.channel(`presence-${currentGroup.id}`, {
      config: {
        presence: { key: currentUser.id },
        broadcast: { self: false },
      },
    });

    // Track user presence for real-time activity status
    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const presenceState = presenceChannel.presenceState();
        console.log('Presence sync:', presenceState);
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        console.log('User joined:', key, newPresences);
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        console.log('User left:', key, leftPresences);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          // Send initial presence data
          const presenceData = {
            user_id: currentUser.id,
            user_name: userName,
            status: timerState === 'idle' ? 'online' : timerState,
            streak: currentStreak,
            last_seen: new Date().toISOString(),
          };
          
          await presenceChannel.track(presenceData);
        }
      });

    // Update presence when timer state changes
    const updatePresence = async () => {
      try {
        await presenceChannel.track({
          user_id: currentUser.id,
          user_name: userName,
          status: timerState === 'idle' ? 'online' : timerState,
          streak: currentStreak,
          last_seen: new Date().toISOString(),
        });
      } catch (error) {
        console.warn('Failed to update presence:', error);
      }
    };

    // Update presence every minute
    const presenceInterval = setInterval(updatePresence, 60 * 1000);

    return () => {
      settingsChannelRef.current = null;
      clearInterval(presenceInterval);
      presenceChannel.untrack();
      supabase.removeChannel(presenceChannel);
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(usersChannel);
      supabase.removeChannel(settingsChannel);
    };
  }, [currentUser, userName, timerState, isGroupCreator, useSyncedTimer, currentStreak, chatSoundEnabled, currentGroup, user]);

  // Enhanced broadcast function using realtime manager
  const broadcastToGroup = useCallback(async (event: string, payload: any) => {
    if (currentGroup && settingsChannelRef.current) {
      try {
        await realtimeManager.broadcast(`settings-${currentGroup.id}`, event, payload);
      } catch (error) {
        // Fallback to direct channel broadcast
        try {
          await settingsChannelRef.current.send({
            type: 'broadcast',
            event,
            payload,
          });
        } catch (fallbackError) {
          console.error('Broadcast failed:', fallbackError);
        }
      }
    }
  }, [currentGroup]);

  const addSystemMessage = useCallback(
    async (text: string) => {
      if (!currentUser || !currentGroup) return;

      await supabase.from('messages').insert({
        user_id: currentUser.id,
        user_name: 'System',
        group_id: currentGroup.id,
        text,
        is_system: true,
      });
    },
    [currentUser, currentGroup]
  );

  const updateUserStatus = useCallback(
    async (status: User['status'], streak?: number) => {
      if (!currentUser) return;

      // Immediately update local state for instant UI feedback
      if (streak !== undefined) {
        setCurrentStreak(streak);
      }

      const updates: Partial<User> & { updated_at?: string } = { status, updated_at: new Date().toISOString() };
      if (streak !== undefined) {
        updates.streak = streak;
        
        // Broadcast leaderboard update when streak changes
        await broadcastToGroup('leaderboard-update', {
          userId: currentUser.id,
          userName: userName,
          newStreak: streak,
          status: status,
        });
      }

      try {
        await supabase.from('users').update(updates).eq('id', currentUser.id);
      } catch (error) {
        console.error('Error updating user status:', error);
        // Revert local state on error if needed
        if (streak !== undefined) {
          setCurrentStreak(currentStreak);
        }
      }
    },
    [currentUser, userName, currentStreak, broadcastToGroup]
  );

  // Enhanced heartbeat to track user and group activity - updates every 30 seconds for better real-time experience
  useEffect(() => {
    if (!currentUser || !currentGroup) return;

    const heartbeat = async () => {
      try {
        const now = new Date().toISOString();
        // Update user activity with current timer state for real-time status
        const currentStatus = timerState === 'idle' ? 'online' : timerState as User['status'];
        await supabase.from('users').update({ 
          updated_at: now, 
          status: currentStatus,
          sessions_today: sessionsCompleted 
        }).eq('id', currentUser.id);
        
        // Update group activity
        await supabase.from('study_groups').update({ updated_at: now }).eq('id', currentGroup.id);
      } catch (error) {
        console.warn('Heartbeat failed:', error);
      }
    };

    // Initial heartbeat
    heartbeat();

    // Send heartbeat every 30 seconds for better real-time updates
    const interval = setInterval(heartbeat, 30 * 1000);

    return () => clearInterval(interval);
  }, [currentUser, currentGroup, timerState, sessionsCompleted]);

  // Check and delete inactive groups (no activity for 30 minutes)
  useEffect(() => {
    const checkInactiveGroups = async () => {
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      
      // Get inactive groups (exclude current user's group from deletion, but check if it exists)
      const { data: inactiveGroups } = await supabase
        .from('study_groups')
        .select('id, name')
        .lt('updated_at', thirtyMinutesAgo);
      
      if (inactiveGroups && inactiveGroups.length > 0) {
        for (const group of inactiveGroups) {
          // Check if this is the current user's group
          if (currentGroup && group.id === currentGroup.id) {
            // Current group is inactive - redirect user
            getAudioManager()?.stopTicking();
            alert(`The study group "${group.name}" was deleted due to 30 minutes of inactivity.`);
            
            // Reset all state
            setCurrentUser(null);
            setCurrentGroup(null);
            setIsNameSet(false);
            setGroupScreen('select');
            setFriends([]);
            setAllUsers([]);
            setMessages([]);
            setExams([]);
            setTimerState('idle');
            setSeconds(DEFAULT_SETTINGS.focusTime * 60);
            setCurrentStreak(0);
            setSessionsCompleted(0);
            setCycleCount(0);
            setStudyTarget('');
            setIsGroupCreator(false);
            setUseSyncedTimer(true);
          }
          
          // Delete all messages in the group
          await supabase.from('messages').delete().eq('group_id', group.id);
          // Delete all exams in the group
          await supabase.from('exams').delete().eq('group_id', group.id);
          // Delete all users in the group
          await supabase.from('users').delete().eq('group_id', group.id);
          // Delete the group itself
          await supabase.from('study_groups').delete().eq('id', group.id);
        }
      }
    };

    // Check every 5 minutes
    const interval = setInterval(checkInactiveGroups, 5 * 60 * 1000);

    // Initial check
    checkInactiveGroups();

    return () => clearInterval(interval);
  }, [currentGroup]);

  // Check for inactive users (inactive for more than 30 minutes) and remove them from the group
  useEffect(() => {
    if (!currentGroup || !currentUser) return;

    const checkInactiveUsers = async () => {
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      
      // Get inactive users (haven't updated in 30 minutes)
      const { data: inactiveUsers } = await supabase
        .from('users')
        .select('id, name')
        .eq('group_id', currentGroup.id)
        .lt('updated_at', thirtyMinutesAgo)
        .neq('id', currentUser.id); // Don't remove current user
      
      if (inactiveUsers && inactiveUsers.length > 0) {
        const inactiveUserIds = inactiveUsers.map(u => u.id);
        const inactiveUserNames = inactiveUsers.map(u => u.name);
        
        // Delete inactive users from the database (removes from group and leaderboard)
        await supabase.from('users').delete().in('id', inactiveUserIds);
        
        // Update local state
        setFriends(prev => prev.filter(f => !inactiveUserIds.includes(f.id)));
        setAllUsers(prev => prev.filter(u => !inactiveUserIds.includes(u.id)));
        
        // Send system message about removed users
        for (const name of inactiveUserNames) {
          await supabase.from('messages').insert({
            user_id: currentUser.id,
            user_name: 'System',
            group_id: currentGroup.id,
            text: `⏰ ${name} was removed due to 30 minutes of inactivity.`,
            is_system: true,
          });
        }
      }
    };

    // Initial check
    checkInactiveUsers();

    // Check every minute
    const interval = setInterval(checkInactiveUsers, 60 * 1000);

    return () => clearInterval(interval);
  }, [currentGroup, currentUser]);

  // Broadcast timer tick to group members (group creator only)
  useEffect(() => {
    if (!currentGroup || !isGroupCreator || timerState === 'idle') return;

    const broadcastTick = async () => {
      await broadcastToGroup('timer-tick', { seconds, timerState });
    };

    // Broadcast every second
    const interval = setInterval(broadcastTick, 1000);

    return () => clearInterval(interval);
  }, [currentGroup, isGroupCreator, timerState, seconds, broadcastToGroup]);

  // Timer logic
  useEffect(() => {
    let interval: NodeJS.Timeout | undefined;

    // Run timer countdown for group creator OR non-creators using their own timer
    const shouldRunOwnTimer = isGroupCreator || !useSyncedTimer;
    
    if (timerState === 'focus' && seconds > 0 && shouldRunOwnTimer) {
      interval = setInterval(() => setSeconds((s) => s - 1), 1000);
    } else if (timerState === 'focus' && seconds === 0 && shouldRunOwnTimer) {
      // Focus session completed
      getAudioManager()?.focusComplete();
      setSessionsCompleted((s) => s + 1);
      const newStreak = currentStreak + 1;
      setCurrentStreak(newStreak);
      const newCycleCount = cycleCount + 1;
      setCycleCount(newCycleCount);
      addSystemMessage(`🎉 ${userName} completed focus session #${newCycleCount}!`);
      updateUserStatus('break', newStreak);
      startBreak(newCycleCount);
    } else if (timerState === 'break' && seconds > 0 && shouldRunOwnTimer) {
      interval = setInterval(() => setSeconds((s) => s - 1), 1000);
    } else if (timerState === 'break' && seconds === 0 && shouldRunOwnTimer) {
      // Break time exceeded
      getAudioManager()?.stopTicking();
      setTimerState('lostInBreak');
      addSystemMessage(`⚠️ ${userName} lost in break`);
      updateUserStatus('offline');
      
      // Broadcast lostInBreak state to group members (only if group creator)
      if (currentGroup && isGroupCreator && settingsChannelRef.current) {
        settingsChannelRef.current.send({
          type: 'broadcast',
          event: 'timer-sync',
          payload: { timerState: 'lostInBreak', seconds: 0, cycleCount: cycleCount, changedById: user?.id, changedByName: userName },
        });
      }
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [timerState, seconds, userName, currentStreak, cycleCount, addSystemMessage, updateUserStatus, settings, isGroupCreator, currentGroup, useSyncedTimer]);

  // Smooth progress animation using requestAnimationFrame
  useEffect(() => {
    const totalTime = getTotalTime();
    
    if (timerState === 'idle') {
      setSmoothProgress(1);
      lastTickRef.current = Date.now();
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    // Reset the last tick time when seconds change (new second started)
    lastTickRef.current = Date.now();

    const animate = () => {
      const now = Date.now();
      const elapsed = (now - lastTickRef.current) / 1000; // fraction of second elapsed
      const currentSeconds = seconds - elapsed; // interpolated seconds
      const newProgress = Math.max(0, currentSeconds / totalTime);
      setSmoothProgress(newProgress);
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [timerState, seconds, settings]);

  // Load public groups on mount
  useEffect(() => {
    const loadPublicGroups = async () => {
      const { data } = await supabase
        .from('study_groups')
        .select('*')
        .eq('is_public', true)
        .order('created_at', { ascending: false });
      if (data) {
        // Attach creator display names
        const creatorIds = Array.from(new Set(data.map((g: any) => g.created_by).filter(Boolean)));
        let creators: any[] = [];
        if (creatorIds.length > 0) {
          const res = await supabase.from('users').select('auth_id, name').in('auth_id', creatorIds);
          creators = res.data || [];
        }
        const groupsWithNames = data.map((g: any) => ({
          ...g,
          created_by_name: (creators.find(c => c.auth_id === g.created_by)?.name) || g.created_by,
        }));
        setPublicGroups(groupsWithNames);
      }
    };
    loadPublicGroups();
    
    // Refresh every 30 seconds
    const interval = setInterval(loadPublicGroups, 30000);
    return () => clearInterval(interval);
  }, []);

  const createGroup = async () => {
    setCreateError('');
    if (!user) {
      setCreateError('Please sign in to create a group.');
      setAuthMode('signin');
      return;
    }
    if (!groupName.trim() || !groupTopic.trim()) return;
    
    const code = generateGroupCode();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('study_groups')
      .insert({
        code,
        name: groupName,
        topic: groupTopic,
        created_by: user.id,
        is_public: isPublicGroup,
        updated_at: now,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating group:', error);
      setCreateError(error.message || 'Failed to create group');
      return;
    }

    if (data) {
      const groupWithName = await attachCreatorName(data);
      setCurrentGroup(groupWithName);
      setIsGroupCreator(true);
      setGroupScreen('lobby');
    }
  };

  const joinGroup = async (code?: string) => {
    // Must be signed in to join a group
    if (!user) {
      setJoinError('Please sign in to join a group');
      setShowAuth(true);
      return;
    }

    const codeToUse = code || joinCode.trim().toUpperCase();
    if (!codeToUse || codeToUse.length !== 6) {
      setJoinError('Please enter a 6-character code');
      return;
    }

    try {
      console.log('Joining group with code:', codeToUse);
      const { data, error } = await supabase
        .from('study_groups')
        .select('*')
        .eq('code', codeToUse)
        .single();

      console.log('Group lookup result:', { data, error });

      if (error || !data) {
        setJoinError('Group not found. Please check the code.');
        return;
      }

      const groupWithName = await attachCreatorName(data);
      console.log('Group with name:', groupWithName);
      setCurrentGroup(groupWithName);

      // Check if user already exists in this group
      console.log('Checking if user exists in group. user.id:', user.id, 'group.id:', groupWithName.id);
      const { data: existingUsers } = await supabase
        .from('users')
        .select('*')
        .eq('auth_id', user.id)
        .eq('group_id', groupWithName.id);

      console.log('Existing users:', existingUsers);
      const existingUser = existingUsers && existingUsers.length > 0 ? existingUsers[0] : null;

      // Always show name entry screen, regardless of whether user exists
      // This lets them choose to use existing name or create new one
      setIsNameSet(false);
      setShowNameConfirm(false);
      
      if (existingUser) {
        console.log('User already in group, showing option to reuse:', existingUser.name);
        // Pre-fill with existing name so they can see it
        setUserName(existingUser.name);
        // Don't auto-login - let them see the name entry screen
      } else {
        console.log('New user in group, showing name entry screen');
        setUserName('');
      }

      setUseSyncedTimer(true);
      setJoinError('');
      setJoinCode('');
      setGroupScreen('lobby');
      console.log('Join complete');
    } catch (e: any) {
      console.error('Join group error:', e);
      setJoinError(e?.message || 'Failed to join group');
    }
  };

  const createUser = async () => {
    if (!userName.trim()) return;
    if (!currentGroup) return;

    console.log('Creating user:', userName);

    await createNewUser();
  };

  const createNewUser = async () => {
    if (!userName.trim() || !currentGroup) return;
    
    setNameError('');
    setShowNameConfirm(false);

    const { data, error } = await supabase
      .from('users')
      .insert({ 
        auth_id: user.id,
        name: userName, 
        group_id: currentGroup.id,
        status: 'online', 
        streak: 0, 
        sessions_today: 0 
      })
      .select()
      .single();

    console.log('Create user result:', { data, error });

    if (error) {
      console.error('Error creating user:', error);
      alert('Error: ' + error.message);
      return;
    }

    if (data) {
      setCurrentUser(data);
      setIsNameSet(true);
      
      // Auto-set study target to group topic
      if (currentGroup?.topic) {
        setStudyTarget(currentGroup.topic);
      }

      // Send welcome message
      await supabase.from('messages').insert({
        user_id: data.id,
        user_name: 'System',
        group_id: currentGroup.id,
        text: `👋 ${userName} joined the study group!`,
        is_system: true,
      });
    }
  };

  const joinAsExistingUser = async () => {
    if (!existingUserId || !currentGroup) return;

    // Get the existing user data
    const { data: existingUser, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', existingUserId)
      .single();

    if (error || !existingUser) {
      setNameError('Could not find user. Please try again.');
      setShowNameConfirm(false);
      return;
    }

    // Update user status to online
    await supabase.from('users').update({ status: 'online' }).eq('id', existingUserId);

    setCurrentUser({ ...existingUser, status: 'online' });
    setCurrentStreak(existingUser.streak || 0);
    setIsNameSet(true);
    setShowNameConfirm(false);

    // Only set creator rights on new group creation

    // Auto-set study target to group topic
    if (currentGroup?.topic) {
      setStudyTarget(currentGroup.topic);
    }

    // Send welcome back message
    await supabase.from('messages').insert({
      user_id: existingUserId,
      user_name: 'System',
      group_id: currentGroup.id,
      text: `👋 ${userName} is back!`,
      is_system: true,
    });
  };

  const rejectExistingUser = () => {
    setShowNameConfirm(false);
    setExistingUserId(null);
    setNameError('Please select another name.');
  };

  const handleKeyPress = (e: React.KeyboardEvent, action: () => void) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      action();
    }
  };

  const startFocus = async () => {
    const audio = getAudioManager();
    audio?.focusStart();
    // Play ticking sound once after start sound
    setTimeout(() => audio?.playSound(AUDIO_FILES.ticking), 500);
    const focusSeconds = settings.focusTime * 60;
    setSeconds(focusSeconds);
    setTimerState('focus');
    await updateUserStatus('focus');
    const targetText = studyTarget ? ` on ${studyTarget}` : '';
    await addSystemMessage(`🎯 ${userName} started focusing${targetText}!`);
    
    // Broadcast timer sync to group members
    if (currentGroup && isGroupCreator) {
      await broadcastToGroup('timer-sync', {
        timerState: 'focus',
        seconds: focusSeconds,
        cycleCount: 0,
        changedById: user?.id,
        changedByName: userName,
      });
    }
  };

  const startBreak = async (cycle: number) => {
    const audio = getAudioManager();
    const isLongBreak = cycle > 0 && cycle % settings.cyclesBeforeLongBreak === 0;
    if (isLongBreak) {
      audio?.longBreak();
    } else {
      audio?.shortBreak();
    }
    const breakTime = isLongBreak ? settings.longBreakTime : settings.shortBreakTime;
    const breakSeconds = breakTime * 60;
    setSeconds(breakSeconds);
    setTimerState('break');
    const breakType = isLongBreak ? 'long break' : 'short break';
    addSystemMessage(`☕ ${userName} on a ${breakType} (${breakTime} min)`);
    
    // Broadcast timer sync to group members
    if (currentGroup && isGroupCreator) {
      await broadcastToGroup('timer-sync', {
        timerState: 'break',
        seconds: breakSeconds,
        cycleCount: cycle,
        changedById: user?.id,
        changedByName: userName,
      });
    }
  };

  const backFromBreak = async () => {
    // Automatically continue to next focus cycle
    const audio = getAudioManager();
    audio?.focusStart();
    // Play ticking sound once after start sound
    setTimeout(() => audio?.playSound(AUDIO_FILES.ticking), 500);
    const focusSeconds = settings.focusTime * 60;
    setSeconds(focusSeconds);
    setTimerState('focus');
    await updateUserStatus('focus');
    const targetText = studyTarget ? ` on ${studyTarget}` : '';
    await addSystemMessage(`✅ ${userName} is back from break! Starting cycle #${cycleCount + 1}${targetText}`);
    
    // Broadcast timer sync to group members
    if (currentGroup && isGroupCreator) {
      await broadcastToGroup('timer-sync', {
        timerState: 'focus',
        seconds: focusSeconds,
        cycleCount: cycleCount,
        changedById: user?.id,
        changedByName: userName,
      });
    }
  };

  const quitSession = async () => {
    getAudioManager()?.stopTicking();
    if (timerState === 'focus') {
      await addSystemMessage(`❌ ${userName} is out.`);
      setCurrentStreak(0);
      await updateUserStatus('online', 0);
    }
    const idleSeconds = settings.focusTime * 60;
    setTimerState('idle');
    setSeconds(idleSeconds);
    setCycleCount(0);
    
    // Broadcast timer sync to group members
    if (currentGroup && isGroupCreator) {
      await broadcastToGroup('timer-sync', {
        timerState: 'idle',
        seconds: idleSeconds,
        cycleCount: 0,
        changedById: user?.id,
        changedByName: userName,
      });
    }
  };

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
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

  // Test function to check if real-time is working
  const testRealTime = () => {
    console.log('🔴 TESTING REAL-TIME SYSTEM');
    console.log('Current User:', { id: currentUser?.id, name: userName });
    console.log('Current Group:', { id: currentGroup?.id, name: currentGroup?.name });
    
    if (currentUser && currentGroup) {
      // Test broadcast channel
      const testChannel = supabase.channel('test-channel');
      testChannel.on('broadcast', { event: 'test' }, (payload) => {
        console.log('✅ BROADCAST WORKING:', payload);
        alert('Real-time broadcast is working!');
      }).subscribe((status) => {
        console.log('Test channel status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('📡 Broadcasting test message...');
          testChannel.send({
            type: 'broadcast',
            event: 'test',
            payload: { message: 'Real-time test', user: userName }
          });
        }
      });
    }
  };

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
    
    // Clear form immediately for better UX
    const examName = newExamName;
    const examDate = newExamDate;
    setNewExamName('');
    setNewExamDate('');

    try {
      const { data, error } = await supabase
        .from('exams')
        .insert({
          user_id: currentUser.id,
          group_id: currentGroup.id,
          name: examName,
          date: examDate,
        })
        .select()
        .single();

      if (data && !error) {
        // Replace optimistic exam with real one
        setExams((prev) => prev.map(e => 
          e.id === tempExamId ? { id: data.id, name: data.name, date: new Date(data.date) } : e
        ));
        
        // Save to localStorage as backup
        const updatedExams = exams.map(e => e.id === tempExamId ? { id: data.id, name: data.name, date: new Date(data.date) } : e);
        localStorage.setItem(`exams_${currentGroup.id}`, JSON.stringify(updatedExams.map(e => ({ ...e, date: e.date.toISOString() }))));
        
        // Broadcast exam update to group with specific action and data
        await broadcastToGroup('exam-update', {
          action: 'add',
          exam: { id: data.id, name: data.name, date: data.date },
          userId: currentUser.id,
        });
      } else {
        console.error('Error adding exam:', error);
        // Remove optimistic exam on error
        setExams((prev) => prev.filter(e => e.id !== tempExamId));
        alert('Failed to add exam. Please try again.');
      }
    } catch (err) {
      console.error('Add exam error:', err);
      // Remove optimistic exam on error
      setExams((prev) => prev.filter(e => e.id !== tempExamId));
      alert('Failed to add exam. Please try again.');
    }
  };

  const updateExam = async (examId: string) => {
    if (!editExamName.trim() || !editExamDate || !currentUser || !currentGroup) return;

    const updatedExam = { id: examId, name: editExamName, date: new Date(editExamDate) };
    
    // Immediately update UI (optimistic update)
    setExams((prev) =>
      prev.map((e) =>
        e.id === examId ? updatedExam : e
      )
    );
    
    const examName = editExamName;
    const examDate = editExamDate;
    setEditingExam(null);
    setEditExamName('');
    setEditExamDate('');

    try {
      const { error } = await supabase
        .from('exams')
        .update({ name: examName, date: examDate })
        .eq('id', examId);

      if (!error) {
        // Broadcast exam update to group with specific action and data
        await broadcastToGroup('exam-update', {
          action: 'update',
          exam: { id: examId, name: examName, date: examDate },
          userId: currentUser.id,
        });
      } else {
        console.error('Error updating exam:', error);
        // Revert optimistic update on error
        const { data } = await supabase.from('exams').select('*').eq('id', examId).single();
        if (data) {
          setExams((prev) =>
            prev.map((e) =>
              e.id === examId ? { id: data.id, name: data.name, date: new Date(data.date) } : e
            )
          );
        }
        alert('Failed to update exam. Please try again.');
      }
    } catch (err) {
      console.error('Update exam error:', err);
      alert('Failed to update exam. Please try again.');
    }
  };

  const deleteExam = async (examId: string) => {
    const examToDelete = exams.find(e => e.id === examId);
    if (!examToDelete) return;
    
    // Immediately update UI (optimistic update)
    setExams((prev) => prev.filter((e) => e.id !== examId));
    
    try {
      const { error } = await supabase.from('exams').delete().eq('id', examId);
      
      if (!error) {
        // Broadcast exam update to group with specific action and data
        if (currentGroup) {
          await broadcastToGroup('exam-update', {
            action: 'delete',
            exam: { id: examId, name: examToDelete.name, date: examToDelete.date.toISOString() },
            userId: currentUser?.id,
          });
        }
      } else {
        console.error('Error deleting exam:', error);
        // Revert optimistic update on error
        setExams((prev) => [...prev, examToDelete]);
        alert('Failed to delete exam. Please try again.');
      }
    } catch (err) {
      console.error('Delete exam error:', err);
      // Revert optimistic update on error
      setExams((prev) => [...prev, examToDelete]);
      alert('Failed to delete exam. Please try again.');
    }
  };

  const removeOfflineUsers = async () => {
    // Remove all offline users from the database
    const offlineUserIds = friends.filter((f) => f.status === 'offline').map((f) => f.id);
    if (offlineUserIds.length === 0) return;
    
    await supabase.from('users').delete().in('id', offlineUserIds);
    setFriends((prev) => prev.filter((f) => f.status !== 'offline'));
    setAllUsers((prev) => prev.filter((u) => !offlineUserIds.includes(u.id)));
  };

  const saveSettings = async () => {
    setSettings(tempSettings);
    setSeconds(tempSettings.focusTime * 60);
    setEditingSettings(false);

    // Broadcast settings change to all users in the group
    if (currentGroup) {
      await broadcastToGroup('settings-change', {
        settings: tempSettings,
        changedById: user?.id,
        changedByName: userName,
      });
    }

    await addSystemMessage(
      `⚙️ Timer Changed by ${userName}: ${tempSettings.focusTime}min focus, ${tempSettings.shortBreakTime}min short break, ${tempSettings.longBreakTime}min long break after ${tempSettings.cyclesBeforeLongBreak} cycles`
    );
  };

  const getDaysUntil = (date: Date) => {
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const getLeaderboard = useCallback(() => {
    const users = [
      { name: userName, streak: currentStreak },
      ...friends.map((f) => ({ name: f.name, streak: f.streak })),
    ];
    return users.sort((a, b) => b.streak - a.streak);
  }, [userName, currentStreak, friends]);

  const copyGroupCode = () => {
    if (currentGroup) {
      navigator.clipboard.writeText(currentGroup.code);
      setShowGroupCode(true);
      setTimeout(() => setShowGroupCode(false), 2000);
    }
  };

  // Show auth screen when no user
  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 text-white">
        <h1 className="text-5xl font-bold mb-4 text-emerald-500">StudyTimer</h1>
        <p className="text-xl text-zinc-400 mb-8">Stay focused with your friends.</p>
        <div className="bg-zinc-900 p-8 rounded-2xl border border-zinc-800 w-80">
          <h2 className="text-2xl font-semibold mb-6 text-center">
            {authMode === 'signin' ? 'Sign In' : 'Sign Up'}
          </h2>
          {authError && (
            <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-200 text-sm">
              {authError}
            </div>
          )}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setAuthError('');
              setAuthLoading(true);
              try {
                if (!email || !password) {
                  setAuthError('Please enter both email and password');
                  setAuthLoading(false);
                  return;
                }
                console.log('Attempting', authMode, 'with', email);
                if (authMode === 'signin') {
                  const { error } = await signIn(email, password);
                  if (error) {
                    console.error('SignIn failed:', error);
                    setAuthError(error.message || 'Failed to sign in. Check your email and password.');
                  } else {
                    console.log('SignIn successful');
                    setEmail('');
                    setPassword('');
                    // Clear group and user state so user can choose fresh
                    setCurrentGroup(null);
                    setCurrentUser(null);
                    setIsNameSet(false);
                    setGroupScreen('select');
                    // Get the current authenticated user
                    const currentUser = await getCurrentUser();
                    console.log('Current user after signin:', currentUser);
                    setUser(currentUser);
                  }
                } else {
                  const { error } = await signUp(email, password);
                  if (error) {
                    console.error('SignUp failed:', error);
                    setAuthError(error.message || 'Failed to sign up');
                  } else {
                    console.log('SignUp successful');
                    setAuthError('Check your email for confirmation link');
                    setEmail('');
                    setPassword('');
                    // Clear group and user state so user can choose fresh
                    setCurrentGroup(null);
                    setCurrentUser(null);
                    setIsNameSet(false);
                    setGroupScreen('select');
                    // Get the current authenticated user
                    const currentUser = await getCurrentUser();
                    console.log('Current user after signup:', currentUser);
                    setUser(currentUser);
                  }
                }
              } catch (err: any) {
                console.error('Auth error:', err);
                setAuthError(err?.message || 'An unexpected error occurred');
              } finally {
                setAuthLoading(false);
              }
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-sm font-medium mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={authLoading}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="your@email.com"
                autoFocus
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={authLoading}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="••••••••"
                required
              />
            </div>
            <button
              type="submit"
              disabled={authLoading}
              onClick={(e) => {
                console.log('Submit button clicked', authMode, email, password);
              }}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-base cursor-pointer"
            >
              {authLoading ? (authMode === 'signin' ? 'Signing in...' : 'Signing up...') : (authMode === 'signin' ? 'Sign In' : 'Sign Up')}
            </button>
          </form>
          <div className="mt-6 space-y-3">
            {authMode === 'reset' ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setAuthError('');
                  setAuthLoading(true);
                  try {
                    if (!resetEmail) {
                      setAuthError('Please enter your email');
                      setAuthLoading(false);
                      return;
                    }
                    const { error } = await resetPassword(resetEmail);
                    if (error) {
                      setAuthError(error.message || 'Failed to send reset email');
                    } else {
                      setResetSent(true);
                      setAuthError('');
                    }
                  } catch (err: any) {
                    setAuthError(err?.message || 'An unexpected error occurred');
                  } finally {
                    setAuthLoading(false);
                  }
                }}
                className="space-y-4"
              >
                {resetSent ? (
                  <div className="bg-emerald-900/50 border border-emerald-700 p-4 rounded-lg text-emerald-200 text-sm text-center">
                    ✓ Password reset email sent! Check your inbox for instructions.
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-sm font-medium mb-2">Email</label>
                      <input
                        type="email"
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        disabled={authLoading}
                        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        placeholder="your@email.com"
                        autoFocus
                        required
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={authLoading}
                      className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-base cursor-pointer"
                    >
                      {authLoading ? 'Sending...' : 'Send Reset Link'}
                    </button>
                  </>
                )}
              </form>
            ) : null}
            <div className="text-center text-sm space-y-2">
              {authMode === 'signin' && (
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('reset');
                    setAuthError('');
                    setResetEmail('');
                  }}
                  className="text-emerald-400 hover:text-emerald-300 block w-full"
                >
                  Forgot password?
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setAuthMode(authMode === 'reset' ? 'signin' : (authMode === 'signin' ? 'signup' : 'signin'));
                  setAuthError('');
                  setResetEmail('');
                  setResetSent(false);
                }}
                className="text-emerald-400 hover:text-emerald-300"
              >
                {authMode === 'reset' ? '← Back to Sign In' : (authMode === 'signin' ? "Don't have an account? Sign Up" : 'Already have an account? Sign In')}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isNameSet) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 text-white">
        <h1 className="text-5xl font-bold mb-4 text-emerald-500">StudyTimer</h1>
        <p className="text-xl text-zinc-400 mb-8">Stay focused with your friends.</p>

        {groupScreen === 'select' && !currentGroup && (
          <div className="w-full max-w-md space-y-4">
            {!user && (
              <div className="bg-zinc-800 p-4 rounded-lg border border-zinc-700 text-center">
                <div className="text-sm text-zinc-300 mb-2">You must sign in to create or join groups.</div>
                <button
                  onClick={() => { setShowAuth(true); setAuthMode('signin'); }}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm"
                >
                  Sign In
                </button>
              </div>
            )}
            {user && (
              <div className="bg-zinc-800 p-4 rounded-lg border border-zinc-700 flex justify-between items-center">
                <div className="text-sm text-zinc-300">
                  Signed in as: <span className="text-emerald-400 font-semibold">{user.email}</span>
                </div>
                <button
                  onClick={async () => {
                    await signOut();
                    setUser(null);
                    setCurrentGroup(null);
                    setCurrentUser(null);
                    setIsNameSet(false);
                  }}
                  className="px-3 py-1 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-sm text-zinc-300"
                >
                  Change User
                </button>
              </div>
            )}
            <button
              onClick={() => user ? setGroupScreen('create') : setShowAuth(true)}
              className="w-full py-4 rounded-xl font-semibold bg-emerald-600 hover:bg-emerald-700 transition text-lg"
            >
              🚀 Create New Group
            </button>
            <button
              onClick={() => user ? setGroupScreen('join') : setShowAuth(true)}
              className="w-full py-4 rounded-xl font-semibold bg-purple-600 hover:bg-purple-700 transition text-lg"
            >
              🔗 Join with Code
            </button>

            {/* Public Groups List */}
            <div className="mt-8">
              <h2 className="text-lg font-semibold mb-4 text-zinc-300">🌐 Public Study Groups</h2>
              {publicGroups.length === 0 ? (
                <p className="text-zinc-500 text-sm">No public groups available. Create one!</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {publicGroups.map((group) => (
                    <div
                      key={group.id}
                      className="bg-zinc-900 p-4 rounded-xl border border-zinc-800 flex justify-between items-center"
                    >
                      <div>
                        <div className="font-semibold">{group.name}</div>
                        <div className="text-sm text-zinc-400">📚 {group.topic}</div>
                        <div className="text-xs text-zinc-500">by {group.created_by_name || group.created_by}</div>
                      </div>
                      <button
                        onClick={() => user ? joinGroup(group.code) : setShowAuth(true)}
                        disabled={!user}
                        className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 transition text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {user ? 'Join' : 'Sign in to join'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {groupScreen === 'create' && (
          <div className="bg-zinc-900 p-8 rounded-2xl border border-zinc-800 w-full max-w-md">
            <button
              onClick={() => setGroupScreen('select')}
              className="text-zinc-400 hover:text-white mb-4"
            >
              ← Back
            </button>
            <h2 className="text-2xl font-bold mb-6">Create New Group</h2>
            
            <label className="block text-sm text-zinc-400 mb-2">Group Name</label>
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="w-full p-3 rounded-lg bg-zinc-800 border border-zinc-700 text-white mb-4"
              placeholder="My Study Group"
            />
            
            <label className="block text-sm text-zinc-400 mb-2">Study Topic</label>
            <input
              type="text"
              value={groupTopic}
              onChange={(e) => setGroupTopic(e.target.value)}
              className="w-full p-3 rounded-lg bg-zinc-800 border border-zinc-700 text-white mb-4"
              placeholder="e.g., Math, Programming, Languages..."
            />
            
            <label className="flex items-center gap-3 mb-6 cursor-pointer">
              <input
                type="checkbox"
                checked={isPublicGroup}
                onChange={(e) => setIsPublicGroup(e.target.checked)}
                className="w-5 h-5 rounded"
              />
              <span className="text-zinc-300">Make this group public (visible to others)</span>
            </label>
            
            <button
              onClick={createGroup}
              disabled={!groupName.trim() || !groupTopic.trim() || !user}
              className="w-full py-3 rounded-lg font-semibold bg-emerald-600 hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {user ? 'Create Group' : 'Sign in to create group'}
            </button>
            {createError && (
              <div className="mt-3 text-sm text-red-400">{createError}</div>
            )}
          </div>
        )}

        {groupScreen === 'join' && (
          <div className="bg-zinc-900 p-8 rounded-2xl border border-zinc-800 w-full max-w-md">
            <button
              onClick={() => setGroupScreen('select')}
              className="text-zinc-400 hover:text-white mb-4"
            >
              ← Back
            </button>
            <h2 className="text-2xl font-bold mb-6">Join a Group</h2>
            
            <label className="block text-sm text-zinc-400 mb-2">Enter Group Code</label>
            <input
              type="text"
              value={joinCode}
              onChange={(e) => {
                setJoinCode(e.target.value.toUpperCase());
                setJoinError('');
              }}
              onKeyDown={(e) => handleKeyPress(e, () => joinGroup())}
              className={`w-full p-3 rounded-lg bg-zinc-800 border ${joinError ? 'border-red-500' : 'border-zinc-700'} text-white mb-2 text-center text-2xl tracking-widest`}
              placeholder="XXXXXX"
              maxLength={6}
            />
            {joinError && (
              <p className="text-red-400 text-sm mb-2">{joinError}</p>
            )}
            
            <button
              onClick={() => joinGroup()}
              disabled={joinCode.length !== 6}
              className="w-full py-3 rounded-lg font-semibold bg-purple-600 hover:bg-purple-700 transition disabled:opacity-50 disabled:cursor-not-allowed mt-4"
            >
              Join Group
            </button>
          </div>
        )}

        {/* Name Entry Screen - shows after joining a group */}
        {groupScreen === 'lobby' && currentGroup && (
          <div className="bg-zinc-900 p-8 rounded-2xl border border-zinc-800 w-full max-w-md">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold">{currentGroup.name}</h2>
              <p className="text-zinc-400">📚 {currentGroup.topic}</p>
              {isGroupCreator && (
                <span className="inline-block mt-2 px-2 py-1 rounded bg-emerald-600 text-xs">👑 Group Creator</span>
              )}
            </div>
            
            {isGroupCreator && (
              <div className="bg-zinc-800 p-4 rounded-xl mb-6 text-center">
                <p className="text-sm text-zinc-400 mb-2">Share this code with friends:</p>
                <div className="text-3xl font-bold tracking-widest text-emerald-400 mb-2">
                  {currentGroup.code}
                </div>
                
                {/* QR Code */}
                <div className="my-4">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(currentGroup.code)}&bgcolor=27272a&color=10b981`}
                    alt="QR Code"
                    className="mx-auto rounded-lg"
                    width={150}
                    height={150}
                  />
                  <p className="text-xs text-zinc-500 mt-2">Scan to get the code</p>
                </div>
                
                <button
                  onClick={copyGroupCode}
                  className="text-sm text-zinc-400 hover:text-white"
                >
                  {showGroupCode ? '✓ Copied!' : '📋 Copy Code'}
                </button>
              </div>
            )}
            
            <label className="block text-sm text-zinc-400 mb-2">Enter your name</label>
            <input
              type="text"
              value={userName}
              onChange={(e) => {
                setUserName(e.target.value);
                setNameError('');
                setShowNameConfirm(false);
              }}
              onKeyDown={(e) => handleKeyPress(e, createUser)}
              className={`w-full p-3 rounded-lg bg-zinc-800 border ${nameError ? 'border-red-500' : 'border-zinc-700'} text-white mb-2`}
              placeholder="Your name"
            />
            {nameError && (
              <p className="text-red-400 text-sm mb-2">{nameError}</p>
            )}
            
            {/* Name confirmation dialog */}
            {showNameConfirm && (
              <div className="bg-yellow-900/50 border border-yellow-700 p-4 rounded-xl mb-4">
                <p className="text-yellow-200 mb-3">
                  <strong>{userName}</strong> already exists in this group. Is that you?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={joinAsExistingUser}
                    className="flex-1 py-2 rounded-lg font-semibold bg-emerald-600 hover:bg-emerald-700 transition"
                  >
                    Yes, that's me!
                  </button>
                  <button
                    onClick={rejectExistingUser}
                    className="flex-1 py-2 rounded-lg font-semibold bg-zinc-600 hover:bg-zinc-500 transition"
                  >
                    No, it's not me
                  </button>
                </div>
              </div>
            )}
            
            {!showNameConfirm && (
              <button
                onClick={createUser}
                disabled={!userName.trim()}
                className="w-full py-3 rounded-lg font-semibold bg-emerald-600 hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Join & Start Studying
              </button>
            )}
            
            <button
              onClick={() => {
                setCurrentGroup(null);
                setGroupScreen('select');
              }}
              className="w-full py-2 text-zinc-400 hover:text-white mt-4 text-sm"
            >
              ← Choose Different Group
            </button>
          </div>
        )}
      </div>
    );
  }

  // Group Selection Screen
  if (!currentGroup) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 text-white p-4">
        <h1 className="text-5xl font-bold mb-4 text-emerald-500">StudyTimer</h1>
        <p className="text-xl text-zinc-400 mb-8">Stay focused with your friends.</p>

        {groupScreen === 'select' && !currentGroup && (
          <div className="w-full max-w-md space-y-4">
            {!user && (
              <div className="bg-zinc-800 p-4 rounded-lg border border-zinc-700 text-center">
                <div className="text-sm text-zinc-400 mb-2">You must sign in to create or join groups.</div>
                <button
                  onClick={() => { setShowAuth(true); setAuthMode('signin'); }}
                  className="w-full py-2 rounded-lg font-semibold bg-emerald-600 hover:bg-emerald-700 transition"
                >
                  Sign In
                </button>
              </div>
            )}
            {user && (
              <>
                <button
                  onClick={() => setGroupScreen('create')}
                  className="w-full py-3 rounded-lg font-semibold bg-emerald-600 hover:bg-emerald-700 transition"
                >
                  ➕ Create a Study Group
                </button>
                <button
                  onClick={() => setGroupScreen('join')}
                  className="w-full py-3 rounded-lg font-semibold bg-purple-600 hover:bg-purple-700 transition"
                >
                  🔗 Join by Code
                </button>
                <div className="my-2 text-center text-sm text-zinc-500">or</div>
                <button
                  onClick={async () => {
                    try {
                      const { data } = await supabase.from('study_groups').select('*').eq('is_public', true).limit(10);
                      if (data) {
                        setPublicGroups(data.map(g => ({
                          ...g,
                          created_by_name: g.created_by,
                        })));
                        setGroupScreen('browse');
                      }
                    } catch (e) {
                      console.log('Error loading public groups');
                    }
                  }}
                  className="w-full py-3 rounded-lg font-semibold bg-blue-600 hover:bg-blue-700 transition"
                >
                  🌍 Browse Public Groups
                </button>
              </>
            )}
          </div>
        )}

        {groupScreen === 'create' && !user && (
          <div className="bg-zinc-800 p-4 rounded-lg border border-zinc-700 text-center w-full max-w-md">
            <div className="text-sm text-zinc-400 mb-2">Please sign in first</div>
            <button
              onClick={() => { setShowAuth(true); setAuthMode('signin'); }}
              className="w-full py-2 rounded-lg font-semibold bg-emerald-600 hover:bg-emerald-700 transition"
            >
              Sign In
            </button>
          </div>
        )}

        {groupScreen === 'create' && user && (
          <div className="bg-zinc-900 p-8 rounded-2xl border border-zinc-800 w-full max-w-md">
            <h2 className="text-2xl font-bold mb-4">Create Study Group</h2>
            <div className="space-y-3">
              <input
                type="text"
                value={groupName}
                onChange={(e) => { setGroupName(e.target.value); setCreateError(''); }}
                placeholder="Group name (e.g., AP Biology)"
                className="w-full p-3 rounded-lg bg-zinc-800 border border-zinc-700 text-white"
              />
              <input
                type="text"
                value={groupTopic}
                onChange={(e) => { setGroupTopic(e.target.value); setCreateError(''); }}
                placeholder="Topic (e.g., Photosynthesis)"
                className="w-full p-3 rounded-lg bg-zinc-800 border border-zinc-700 text-white"
              />
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={isPublicGroup}
                  onChange={(e) => setIsPublicGroup(e.target.checked)}
                  id="publicToggle"
                  className="w-4 h-4"
                />
                <label htmlFor="publicToggle" className="text-sm">Make this group public (anyone can find it)</label>
              </div>
              {createError && <div className="text-red-400 text-sm">{createError}</div>}
              <button
                onClick={async () => {
                  if (!groupName.trim() || !groupTopic.trim()) {
                    setCreateError('Please fill in all fields');
                    return;
                  }
                  try {
                    const code = generateGroupCode();
                    const { error } = await supabase.from('study_groups').insert([
                      {
                        code,
                        name: groupName,
                        topic: groupTopic,
                        created_by: user.id,
                        is_public: isPublicGroup,
                      },
                    ]);
                    if (error) {
                      setCreateError(error.message);
                    } else {
                      const { data } = await supabase
                        .from('study_groups')
                        .select('*')
                        .eq('code', code)
                        .single();
                      if (data) {
                        const withName = await attachCreatorName(data);
                        setCurrentGroup(withName);
                        setGroupName('');
                        setGroupTopic('');
                        setIsPublicGroup(true);
                      }
                    }
                  } catch (e) {
                    setCreateError('Failed to create group');
                  }
                }}
                className="w-full py-3 rounded-lg font-semibold bg-emerald-600 hover:bg-emerald-700 transition"
              >
                Create Group
              </button>
              <button
                onClick={() => setGroupScreen('select')}
                className="w-full py-2 text-zinc-400 hover:text-white text-sm"
              >
                ← Back
              </button>
            </div>
          </div>
        )}

        {groupScreen === 'join' && (
          <div className="bg-zinc-900 p-8 rounded-2xl border border-zinc-800 w-full max-w-md">
            <h2 className="text-2xl font-bold mb-4">Join Study Group</h2>
            <div className="space-y-3">
              <input
                type="text"
                value={joinCode.toUpperCase()}
                onChange={(e) => { setJoinCode(e.target.value.toUpperCase()); setJoinError(''); }}
                placeholder="Enter 6-character code"
                maxLength={6}
                className="w-full p-3 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-center text-2xl tracking-wider"
              />
              {joinError && <div className="text-red-400 text-sm">{joinError}</div>}
              <button
                onClick={() => {
                  console.log('Join button clicked with code:', joinCode);
                  joinGroup(joinCode);
                }}
                disabled={joinCode.length !== 6}
                className="w-full py-3 rounded-lg font-semibold bg-purple-600 hover:bg-purple-700 transition disabled:opacity-50 disabled:cursor-not-allowed mt-4"
              >
                Join Group
              </button>
            </div>
          </div>
        )}

        {groupScreen === 'browse' && (
          <div className="w-full max-w-md space-y-4">
            {publicGroups.length === 0 ? (
              <div className="bg-zinc-800 p-4 rounded-lg border border-zinc-700 text-center">
                <div className="text-sm text-zinc-400">No public groups found</div>
              </div>
            ) : (
              publicGroups.map((group) => (
                <button
                  key={group.id}
                  onClick={() => {
                    if (user) {
                      joinGroup(group.code);
                    } else {
                      setShowAuth(true);
                    }
                  }}
                  className="w-full text-left p-4 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition"
                >
                  <div className="font-semibold text-emerald-400">{group.name}</div>
                  <div className="text-sm text-zinc-400">📚 {group.topic}</div>
                  <div className="text-xs text-zinc-500">Created by {group.created_by_name}</div>
                </button>
              ))
            )}
            <button
              onClick={() => setGroupScreen('select')}
              className="w-full py-2 text-zinc-400 hover:text-white text-sm"
            >
              ← Back
            </button>
          </div>
        )}

        {currentGroup && !isNameSet && groupScreen !== 'create' && groupScreen !== 'join' && groupScreen !== 'browse' && (
          <div className="relative bg-zinc-900 p-8 rounded-2xl border border-zinc-800 w-full max-w-md">
            <div className="mb-4">
              <p className="text-sm text-emerald-400 font-semibold">✅ You've joined <strong>{currentGroup.name}</strong>!</p>
              <p className="text-xs text-emerald-300 mt-1">Now enter the name you want to use</p>
            </div>
            
            <label className="block text-sm text-zinc-400 mb-2">Your Name in Group</label>
            <input
              type="text"
              value={userName}
              onChange={(e) => {
                setUserName(e.target.value);
                setNameError('');
                setShowNameConfirm(false);
              }}
              onKeyDown={(e) => handleKeyPress(e, createUser)}
              className={`w-full p-3 rounded-lg bg-zinc-800 border ${nameError ? 'border-red-500' : 'border-zinc-700'} text-white mb-2`}
              placeholder="Your name"
              autoFocus
            />
            {nameError && (
              <p className="text-red-400 text-sm mb-2">{nameError}</p>
            )}
            
            {showNameConfirm && (
              <div className="bg-yellow-900/50 border border-yellow-700 p-4 rounded-xl mb-4">
                <p className="text-yellow-200 mb-3">
                  <strong>{userName}</strong> already exists in this group. Is that you?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={joinAsExistingUser}
                    className="flex-1 py-2 rounded-lg font-semibold bg-emerald-600 hover:bg-emerald-700 transition"
                  >
                    Yes, that's me!
                  </button>
                  <button
                    onClick={rejectExistingUser}
                    className="flex-1 py-2 rounded-lg font-semibold bg-zinc-600 hover:bg-zinc-500 transition"
                  >
                    No, it's not me
                  </button>
                </div>
              </div>
            )}
            
            {!showNameConfirm && (
              <button
                onClick={createUser}
                disabled={!userName.trim()}
                className="w-full py-3 rounded-lg font-semibold bg-emerald-600 hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Join & Start Studying
              </button>
            )}
            
            <button
              onClick={() => {
                setCurrentGroup(null);
                setGroupScreen('select');
              }}
              className="w-full py-2 text-zinc-400 hover:text-white mt-4 text-sm"
            >
              ← Choose Different Group
            </button>
          </div>
        )}

        {groupScreen === 'lobby' && currentGroup && (
          <div className="bg-zinc-900 p-8 rounded-2xl border border-zinc-800 w-full max-w-md">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold">{currentGroup.name}</h2>
              <p className="text-zinc-400">📚 {currentGroup.topic}</p>
              {isGroupCreator && (
                <span className="inline-block mt-2 px-2 py-1 rounded bg-emerald-600 text-xs">👑 Group Creator</span>
              )}
            </div>
            
            {isGroupCreator && (
              <div className="bg-zinc-800 p-4 rounded-xl mb-6 text-center">
                <p className="text-sm text-zinc-400 mb-2">Share this code with friends:</p>
                <div className="text-3xl font-bold tracking-widest text-emerald-400 mb-2">
                  {currentGroup.code}
                </div>
                
                {/* QR Code */}
                <div className="my-4">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(currentGroup.code)}&bgcolor=27272a&color=10b981`}
                    alt="QR Code"
                    className="mx-auto rounded-lg"
                    width={150}
                    height={150}
                  />
                  <p className="text-xs text-zinc-500 mt-2">Scan to get the code</p>
                </div>
                
                <button
                  onClick={copyGroupCode}
                  className="text-sm text-zinc-400 hover:text-white"
                >
                  {showGroupCode ? '✓ Copied!' : '📋 Copy Code'}
                </button>
              </div>
            )}
            
            <label className="block text-sm text-zinc-400 mb-2">Enter your name</label>
            <input
              type="text"
              value={userName}
              onChange={(e) => {
                setUserName(e.target.value);
                setNameError('');
                setShowNameConfirm(false);
              }}
              onKeyDown={(e) => handleKeyPress(e, createUser)}
              className={`w-full p-3 rounded-lg bg-zinc-800 border ${nameError ? 'border-red-500' : 'border-zinc-700'} text-white mb-2`}
              placeholder="Your name"
            />
            {nameError && (
              <p className="text-red-400 text-sm mb-2">{nameError}</p>
            )}
            
            {/* Name confirmation dialog */}
            {showNameConfirm && (
              <div className="bg-yellow-900/50 border border-yellow-700 p-4 rounded-xl mb-4">
                <p className="text-yellow-200 mb-3">
                  <strong>{userName}</strong> already exists in this group. Is that you?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={joinAsExistingUser}
                    className="flex-1 py-2 rounded-lg font-semibold bg-emerald-600 hover:bg-emerald-700 transition"
                  >
                    Yes, that's me!
                  </button>
                  <button
                    onClick={rejectExistingUser}
                    className="flex-1 py-2 rounded-lg font-semibold bg-zinc-600 hover:bg-zinc-500 transition"
                  >
                    No, it's not me
                  </button>
                </div>
              </div>
            )}
            
            {!showNameConfirm && (
              <button
                onClick={createUser}
                disabled={!userName.trim()}
                className="w-full py-3 rounded-lg font-semibold bg-emerald-600 hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Join & Start Studying
              </button>
            )}
            
            <button
              onClick={() => {
                setCurrentGroup(null);
                setGroupScreen('select');
              }}
              className="w-full py-2 text-zinc-400 hover:text-white mt-4 text-sm"
            >
              ← Choose Different Group
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4">
      {/* Settings Change Warning Banner */}
      {settingsWarning && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 animate-pulse">
          <div className="bg-yellow-600 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-3">
            <span className="font-semibold">{settingsWarning}</span>
            <button
              onClick={() => setSettingsWarning(null)}
              className="text-white/80 hover:text-white"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Account Modal */}
      {user && showAuth && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99998] p-4">
          <div className="bg-zinc-900 p-8 rounded-2xl border border-zinc-800 w-80">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-semibold">Account</h2>
              <button
                onClick={() => setShowAuth(false)}
                className="text-zinc-400 hover:text-white text-2xl"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="space-y-4">
              <div className="bg-zinc-800 p-4 rounded-lg">
                <p className="text-sm text-zinc-400">Signed in as</p>
                <p className="text-white font-medium break-all">{user.email}</p>
              </div>
              {currentUser && currentGroup && (
                <div className="bg-zinc-800 p-4 rounded-lg">
                  <p className="text-sm text-zinc-400">Studying as</p>
                  <p className="text-white font-medium">{currentUser.name}</p>
                  <p className="text-xs text-zinc-500 mt-1">in {currentGroup.name}</p>
                </div>
              )}
              <button
                onClick={() => {
                  setCurrentUser(null);
                  setIsNameSet(false);
                  setShowAuth(false);
                  // Keep current group, so name screen shows
                }}
                className="w-full py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors text-sm"
              >
                Change User
              </button>
              <button
                onClick={async () => {
                  await signOut();
                  setUser(null);
                  setIsNameSet(false);
                  setCurrentGroup(null);
                  setCurrentUser(null);
                  setGroupScreen('select');
                  setShowAuth(false);
                }}
                className="w-full py-3 bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="fixed top-3 right-3 z-[99999] pointer-events-auto">
        {!user ? (
          <button
            onMouseDown={() => {
              setShowAuth(true);
              setAuthMode('signin');
            }}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-sm font-medium transition-colors shadow-lg cursor-pointer"
            aria-label="Sign in"
            style={{ pointerEvents: 'auto' }}
          >
            Sign In
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onMouseDown={() => setShowAuth(true)}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-sm font-medium transition-colors shadow-lg cursor-pointer"
              aria-label="Account"
              style={{ pointerEvents: 'auto' }}
            >
              {currentUser ? `👤 ${currentUser.name}` : 'Account'}
            </button>
          </div>
        )}
      </div>

      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-4xl font-bold text-emerald-500">StudyTimer</h1>
          <div className="absolute right-6 top-6">
            {!user ? (
              <button
                onClick={() => {
                  setShowAuth(true);
                  setAuthMode('signin');
                }}
                className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
              >
                Sign In
              </button>
            ) : (
              <button
                onClick={() => setShowAuth(true)}
                className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
              >
                Account
              </button>
            )}
          </div>
          {currentGroup && (
            <div className="flex items-center justify-center gap-2 mt-2">
              <span className="text-zinc-400">📚 {currentGroup.name}</span>
              <span className="text-zinc-600">•</span>
              <span className="text-purple-400">Created by {currentGroup.created_by_name || currentGroup.created_by}</span>
              <span className="text-zinc-600">•</span>
              <button
                onClick={copyGroupCode}
                className="text-emerald-400 hover:text-emerald-300 font-mono"
                title="Click to copy code"
              >
                {showGroupCode ? '✓ Copied!' : `Code: ${currentGroup.code}`}
              </button>
            </div>
          )}
          {currentUser && (
            <p className="text-emerald-400 mt-3 font-semibold">
              ✓ Logged in as: <span className="text-emerald-300">{currentUser.name}</span>
            </p>
          )}
          <p className="text-zinc-400 mt-1">
            Current Streak: {currentStreak} sessions
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Timer Section */}
          <div className="lg:col-span-1">
            <div className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800">
              <h2 className="text-xl font-semibold mb-4 text-center">
                {timerState === 'idle' && '🎯 Ready to Focus'}
                {timerState === 'focus' && '🔥 Focus Mode'}
                {timerState === 'break' && '☕ Break Time'}
                {timerState === 'lostInBreak' && '⚠️ Lost in Break!'}
              </h2>

              {/* Study Target */}
              <div className="mb-4">
                {!editingTarget ? (
                  <div
                    onClick={() => setEditingTarget(true)}
                    className="text-center cursor-pointer group"
                  >
                    {studyTarget ? (
                      <div className="text-sm text-zinc-400">
                        Studying for: <span className="text-emerald-400 font-semibold">{studyTarget}</span>
                        <span className="text-zinc-600 ml-2 opacity-0 group-hover:opacity-100">✏️</span>
                      </div>
                    ) : (
                      <div className="text-sm text-zinc-500 hover:text-zinc-400">
                        + Click to set study target
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={studyTarget}
                      onChange={(e) => setStudyTarget(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') setEditingTarget(false);
                        if (e.key === 'Escape') setEditingTarget(false);
                      }}
                      className="w-full p-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-center"
                      placeholder="What are you studying for?"
                      autoFocus
                    />
                    {exams.length > 0 && (
                      <div className="flex flex-wrap gap-1 justify-center">
                        {exams.map((exam) => (
                          <button
                            key={exam.id}
                            onClick={() => {
                              setStudyTarget(exam.name);
                              setEditingTarget(false);
                            }}
                            className="text-xs px-2 py-1 rounded bg-purple-900/50 text-purple-300 hover:bg-purple-800/50"
                          >
                            {exam.name}
                          </button>
                        ))}
                      </div>
                    )}
                    <button
                      onClick={() => setEditingTarget(false)}
                      className="w-full py-1 text-xs text-zinc-500 hover:text-zinc-400"
                    >
                      Done
                    </button>
                  </div>
                )}
              </div>

              {/* Circular Progress Timer */}
              <div className="flex justify-center mb-6">
                <CircularProgress progress={progress} size={220} strokeWidth={14} timerState={timerState}>
                  <div className="text-center">
                    <div
                      className={`text-4xl font-mono font-bold ${
                        timerState === 'lostInBreak'
                          ? 'text-red-500'
                          : timerState === 'break'
                          ? 'text-yellow-500'
                          : 'text-white'
                      }`}
                    >
                      {formatTime(seconds)}
                    </div>
                    <div className="text-zinc-500 text-sm mt-1">
                      Cycle {cycleCount} / {settings.cyclesBeforeLongBreak}
                    </div>
                  </div>
                </CircularProgress>
              </div>

              {/* Timer Settings Display */}
              <div className="mb-4 text-center text-xs text-zinc-400">
                <span className="inline-block mx-2">Focus: <span className="text-emerald-400 font-semibold">{settings.focusTime} min</span></span>
                <span className="inline-block mx-2">Short Break: <span className="text-yellow-400 font-semibold">{settings.shortBreakTime} min</span></span>
                <span className="inline-block mx-2">Long Break: <span className="text-purple-400 font-semibold">{settings.longBreakTime} min</span></span>
                <span className="inline-block mx-2">Cycles: <span className="text-blue-400 font-semibold">{settings.cyclesBeforeLongBreak}</span></span>
              </div>

              <div className="space-y-2">
                {timerState === 'idle' && (
                  <button
                    onClick={startFocus}
                    className="w-full py-3 rounded-lg font-semibold bg-emerald-600 hover:bg-emerald-700 transition"
                  >
                    Start Focus Session
                  </button>
                )}

                {timerState === 'focus' && (
                  <button
                    onClick={quitSession}
                    className="w-full py-3 rounded-lg font-semibold bg-red-600 hover:bg-red-700 transition"
                  >
                    Quit Session
                  </button>
                )}

                {timerState === 'break' && (
                  <>
                    <button
                      onClick={backFromBreak}
                      className="w-full py-3 rounded-lg font-semibold bg-emerald-600 hover:bg-emerald-700 transition"
                    >
                      Back from Break
                    </button>
                    <p className="text-center text-yellow-400 text-sm">
                      Click before timer ends or you&apos;ll be marked as lost!
                    </p>
                  </>
                )}

                {timerState === 'lostInBreak' && (
                  <button
                    onClick={() => {
                      setTimerState('idle');
                      setSeconds(settings.focusTime * 60);
                      setCycleCount(0);
                      updateUserStatus('online');
                    }}
                    className="w-full py-3 rounded-lg font-semibold bg-zinc-700 hover:bg-zinc-600 transition"
                  >
                    Reset Timer
                  </button>
                )}
              </div>

              <div className="mt-4 text-center text-zinc-400 text-sm">
                Sessions completed today: {sessionsCompleted}
              </div>

              {/* Timer Sync Toggle - for non-creators only */}
              {!isGroupCreator && (
                <div className="mt-4 pt-4 border-t border-zinc-800">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-800">
                    <div>
                      <div className="text-sm font-medium">
                        {useSyncedTimer ? '🔗 Synced with Creator' : '⏱️ Using Own Timer'}
                      </div>
                      <div className="text-xs text-zinc-400">
                        {useSyncedTimer 
                          ? `Timer controlled by ${currentGroup?.created_by_name || currentGroup?.created_by || 'group creator'}`
                          : 'You control your own timer independently'
                        }
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        if (!useSyncedTimer) {
                          // Switching to synced - reset to idle and wait for creator's sync
                          setTimerState('idle');
                          setSeconds(settings.focusTime * 60);
                          setCycleCount(0);
                          getAudioManager()?.stopTicking();
                        }
                        setUseSyncedTimer(!useSyncedTimer);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                        useSyncedTimer
                          ? 'bg-emerald-600 hover:bg-emerald-700'
                          : 'bg-purple-600 hover:bg-purple-700'
                      }`}
                    >
                      {useSyncedTimer ? 'Use Own Timer' : 'Sync with Creator'}
                    </button>
                  </div>
                </div>
              )}

              {/* Timer Settings */}
              <div className="mt-4 pt-4 border-t border-zinc-800">
                {!editingSettings ? (
                  <button
                    onClick={() => {
                      setTempSettings(settings);
                      setEditingSettings(true);
                    }}
                    className={`w-full py-2 rounded-lg text-sm transition ${
                      isGroupCreator
                        ? 'bg-zinc-800 hover:bg-zinc-700'
                        : useSyncedTimer
                          ? 'bg-zinc-800/50 text-zinc-500 cursor-not-allowed'
                          : 'bg-zinc-800 hover:bg-zinc-700'
                    }`}
                    disabled={!isGroupCreator && useSyncedTimer}
                    title={!isGroupCreator && useSyncedTimer ? 'Settings are controlled by the group creator. Switch to "Use Own Timer" to change settings.' : ''}
                  >
                    ⚙️ Timer Settings {isGroupCreator && '👑'} {!isGroupCreator && useSyncedTimer && '(Synced)'}
                  </button>
                ) : (
                  <div className="space-y-3">
                    <div className="text-sm text-zinc-400 text-center">Timer Settings {isGroupCreator && '👑'}</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-zinc-500">Focus (min)</label>
                        <input
                          type="number"
                          value={tempSettings.focusTime}
                          onChange={(e) =>
                            setTempSettings({ ...tempSettings, focusTime: parseInt(e.target.value) || 1 })
                          }
                          className="w-full p-2 rounded bg-zinc-800 border border-zinc-700 text-sm"
                          min="1"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-500">Short Break</label>
                        <input
                          type="number"
                          value={tempSettings.shortBreakTime}
                          onChange={(e) =>
                            setTempSettings({ ...tempSettings, shortBreakTime: parseInt(e.target.value) || 1 })
                          }
                          className="w-full p-2 rounded bg-zinc-800 border border-zinc-700 text-sm"
                          min="1"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-500">Long Break</label>
                        <input
                          type="number"
                          value={tempSettings.longBreakTime}
                          onChange={(e) =>
                              setTempSettings({ ...tempSettings, longBreakTime: parseInt(e.target.value) || 1 })
                            }
                            className="w-full p-2 rounded bg-zinc-800 border border-zinc-700 text-sm"
                            min="1"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-zinc-500">Cycles</label>
                          <input
                            type="number"
                            value={tempSettings.cyclesBeforeLongBreak}
                            onChange={(e) =>
                              setTempSettings({ ...tempSettings, cyclesBeforeLongBreak: parseInt(e.target.value) || 1 })
                            }
                            className="w-full p-2 rounded bg-zinc-800 border border-zinc-700 text-sm"
                            min="1"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={saveSettings}
                          className="flex-1 py-2 rounded-lg text-sm bg-emerald-600 hover:bg-emerald-700 transition"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingSettings(false)}
                          className="flex-1 py-2 rounded-lg text-sm bg-zinc-700 hover:bg-zinc-600 transition"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
            </div>

            {/* Leaderboard */}
            <div className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800 mt-4">
              <h2 className="text-xl font-semibold mb-4">🏆 Streak Leaderboard</h2>
              <div className="space-y-2">
                {getLeaderboard().map((user, index) => (
                  <div
                    key={user.name}
                    className={`flex justify-between items-center p-2 rounded-lg ${
                      index === 0 ? 'bg-yellow-900/30' : 'bg-zinc-800'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {index === 0 && '👑'}
                      {index === 1 && '🥈'}
                      {index === 2 && '🥉'}
                      {user.name}
                    </span>
                    <span className={user.streak > 0 ? 'text-emerald-400' : 'text-zinc-400'}>
                      {user.streak} {user.streak > 0 ? '🔥' : '😢'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Chat Section */}
          <div className="lg:col-span-1">
            <div className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800 h-full flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">💬 Study Chat</h2>
                <button
                  onClick={() => setChatSoundEnabled(!chatSoundEnabled)}
                  className={`p-2 rounded-lg transition-colors ${
                    chatSoundEnabled
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-zinc-700 hover:bg-zinc-600'
                  }`}
                  title={chatSoundEnabled ? 'Mute chat notifications' : 'Unmute chat notifications'}
                >
                  {chatSoundEnabled ? '🔔' : '🔕'}
                </button>
              </div>

              <div 
                ref={chatContainerRef}
                className="flex-1 overflow-y-auto space-y-2 mb-4 max-h-96 flex flex-col"
              >
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`p-2 rounded-lg ${
                      msg.isSystem
                        ? 'bg-zinc-800 text-zinc-400 text-sm italic'
                        : msg.user === userName
                        ? 'bg-emerald-900/50 ml-4'
                        : 'bg-zinc-800 mr-4'
                    }`}
                  >
                    {!msg.isSystem && <span className="font-semibold text-emerald-400">{msg.user}: </span>}
                    {msg.text}
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => handleKeyPress(e, sendMessage)}
                  className="flex-1 p-2 rounded-lg bg-zinc-800 border border-zinc-700"
                  placeholder="Type a message..."
                />
                <button
                  onClick={sendMessage}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 transition"
                >
                  Send
                </button>
                <button
                  onClick={testRealTime}
                  className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 transition text-xs"
                  title="Test if real-time messaging is working (check console)"
                >
                  Test RT
                </button>
              </div>
            </div>
          </div>

          {/* Friends & Calendar Section */}
          <div className="lg:col-span-1 space-y-4">
            {/* Friends */}
            <div className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xl font-semibold">👥 Study Group</h2>
                <button
                  onClick={removeOfflineUsers}
                  className="text-xs px-2 py-1 rounded bg-zinc-700 hover:bg-red-600 transition"
                  title="Remove offline users"
                >
                  🧹 Remove Offline
                </button>
              </div>
              
              <p className="text-sm text-zinc-400 mb-4">
                {friends.filter(f => f.status !== 'offline').length + 1} active user{friends.filter(f => f.status !== 'offline').length !== 0 ? 's' : ''}
              </p>

              <div className="space-y-2 mb-4">
                {/* Current user */}
                <div className="flex justify-between items-center p-2 bg-zinc-800 rounded-lg border border-emerald-600/30">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    {userName} <span className="text-xs text-zinc-500">(you)</span>
                  </span>
                  <span className="text-xs text-zinc-400 capitalize">{timerState === 'idle' ? 'online' : timerState}</span>
                </div>
                
                {friends.length === 0 ? (
                  <p className="text-zinc-500 text-sm">No one else is here yet...</p>
                ) : (
                  [...friends]
                    .sort((a, b) => {
                      const order = { focus: 0, break: 1, online: 2, offline: 3 };
                      return order[a.status] - order[b.status];
                    })
                    .map((friend) => (
                    <div key={friend.id} className="flex justify-between items-center p-2 bg-zinc-800 rounded-lg">
                      <span className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            friend.status === 'focus'
                              ? 'bg-emerald-500'
                              : friend.status === 'break'
                              ? 'bg-yellow-500'
                              : friend.status === 'online'
                              ? 'bg-blue-500'
                              : 'bg-zinc-500'
                          }`}
                        />
                        {friend.name}
                      </span>
                      <span className="text-xs text-zinc-400 capitalize">{friend.status}</span>
                    </div>
                  ))
                )}
              </div>
              
              <button
                onClick={async () => {
                  // Delete all other users (keep current user)
                  await supabase.from('users').delete().neq('id', currentUser?.id || '');
                  setFriends([]);
                  setAllUsers([]);
                  
                  // Clear all messages (chat)
                  await supabase.from('messages').delete().neq('id', '00000000-0000-0000-0000-000000000000');
                  setMessages([]);
                  
                  // Reset current user's streak (leaderboard)
                  setCurrentStreak(0);
                  setSessionsCompleted(0);
                  setCycleCount(0);
                  if (currentUser) {
                    await supabase.from('users').update({ streak: 0, sessions_today: 0 }).eq('id', currentUser.id);
                  }
                  
                  // Add welcome message for new session
                  await supabase.from('messages').insert({
                    user_id: currentUser?.id,
                    user_name: 'System',
                    text: `🌟 ${userName} started a new study session!`,
                    is_system: true,
                  });
                }}
                className="w-full py-2 rounded-lg text-sm bg-purple-600 hover:bg-purple-700 transition"
              >
                🚀 Start a New Session
              </button>
              
              <button
                onClick={async () => {
                  if (!currentUser || !currentGroup) return;
                  
                  // Send leave message
                  await supabase.from('messages').insert({
                    user_id: currentUser.id,
                    user_name: 'System',
                    group_id: currentGroup.id,
                    text: `👋 ${userName} left the group.`,
                    is_system: true,
                  });
                  
                  // Delete user from the group
                  await supabase.from('users').delete().eq('id', currentUser.id);
                  
                  // Stop ticking audio if playing
                  getAudioManager()?.stopTicking();
                  
                  // Reset all state
                  setCurrentUser(null);
                  setCurrentGroup(null);
                  setIsNameSet(false);
                  setGroupScreen('select');
                  setFriends([]);
                  setAllUsers([]);
                  setMessages([]);
                  setExams([]);
                  setTimerState('idle');
                  setSeconds(DEFAULT_SETTINGS.focusTime * 60);
                  setCurrentStreak(0);
                  setSessionsCompleted(0);
                  setCycleCount(0);
                  setStudyTarget('');
                  setIsGroupCreator(false);
                  setUseSyncedTimer(true);
                }}
                className="w-full py-2 rounded-lg text-sm bg-red-600 hover:bg-red-700 transition mt-2"
              >
                🚪 Leave this Group
              </button>
              
              {/* Delete Group button - only for group creator */}
              {isGroupCreator && (
                <button
                  onClick={async () => {
                    if (!currentUser || !currentGroup) return;
                    
                    const confirmed = window.confirm(
                      `Are you sure you want to delete "${currentGroup.name}"? This will remove all members and cannot be undone.`
                    );
                    if (!confirmed) return;
                    
                    // Broadcast group deletion to all members
                    if (settingsChannelRef.current) {
                      await settingsChannelRef.current.send({
                        type: 'broadcast',
                        event: 'group-deleted',
                        payload: { groupName: currentGroup.name, deletedBy: userName },
                      });
                    }
                    
                    // Delete all messages in the group
                    await supabase.from('messages').delete().eq('group_id', currentGroup.id);
                    
                    // Delete all exams in the group
                    await supabase.from('exams').delete().eq('group_id', currentGroup.id);
                    
                    // Delete all users in the group
                    await supabase.from('users').delete().eq('group_id', currentGroup.id);
                    
                    // Delete the group itself
                    await supabase.from('study_groups').delete().eq('id', currentGroup.id);
                    
                    // Stop ticking audio if playing
                    getAudioManager()?.stopTicking();
                    
                    // Reset all state
                    setCurrentUser(null);
                    setCurrentGroup(null);
                    setIsNameSet(false);
                    setGroupScreen('select');
                    setFriends([]);
                    setAllUsers([]);
                    setMessages([]);
                    setExams([]);
                    setTimerState('idle');
                    setSeconds(DEFAULT_SETTINGS.focusTime * 60);
                    setCurrentStreak(0);
                    setSessionsCompleted(0);
                    setCycleCount(0);
                    setStudyTarget('');
                    setIsGroupCreator(false);
                    setUseSyncedTimer(true);
                  }}
                  className="w-full py-2 rounded-lg text-sm bg-red-900 hover:bg-red-800 transition mt-2 border border-red-700"
                >
                  🗑️ Delete this Group
                </button>
              )}
            </div>

            {/* Exam Countdown */}
            <div className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800">
              <h2 className="text-xl font-semibold mb-4">📅 Exam Countdown</h2>

              <div className="space-y-2 mb-4">
                {exams.length === 0 ? (
                  <p className="text-zinc-500 text-sm">No exams added yet.</p>
                ) : (
                  exams
                    .sort((a, b) => a.date.getTime() - b.date.getTime())
                    .map((exam) => {
                      const daysUntil = getDaysUntil(exam.date);
                      const isEditing = editingExam === exam.id;
                      return (
                        <div
                          key={exam.id}
                          className={`p-3 rounded-lg ${
                            daysUntil <= 3 ? 'bg-red-900/50 border border-red-700' : 'bg-zinc-800'
                          }`}
                        >
                          {isEditing ? (
                            <div className="space-y-2">
                              <input
                                type="text"
                                value={editExamName}
                                onChange={(e) => setEditExamName(e.target.value)}
                                className="w-full p-1 rounded bg-zinc-700 border border-zinc-600 text-sm"
                              />
                              <input
                                type="date"
                                value={editExamDate}
                                onChange={(e) => setEditExamDate(e.target.value)}
                                className="w-full p-1 rounded bg-zinc-700 border border-zinc-600 text-sm"
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={() => updateExam(exam.id)}
                                  className="flex-1 px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-xs"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => setEditingExam(null)}
                                  className="flex-1 px-2 py-1 rounded bg-zinc-600 hover:bg-zinc-500 text-xs"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="flex justify-between items-start">
                                <div className="font-semibold">{exam.name}</div>
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => {
                                      setEditingExam(exam.id);
                                      setEditExamName(exam.name);
                                      setEditExamDate(exam.date.toISOString().split('T')[0]);
                                    }}
                                    className="text-xs px-1.5 py-0.5 rounded bg-zinc-700 hover:bg-zinc-600"
                                    title="Edit"
                                  >
                                    ✏️
                                  </button>
                                  <button
                                    onClick={() => deleteExam(exam.id)}
                                    className="text-xs px-1.5 py-0.5 rounded bg-zinc-700 hover:bg-red-600"
                                    title="Delete"
                                  >
                                    🗑️
                                  </button>
                                </div>
                              </div>
                              <div className="text-sm text-zinc-400 flex justify-between">
                                <span>{exam.date.toLocaleDateString()}</span>
                                <span
                                  className={`font-semibold ${
                                    daysUntil <= 3 ? 'text-red-400' : daysUntil <= 7 ? 'text-yellow-400' : 'text-emerald-400'
                                  }`}
                                >
                                  {daysUntil} days
                                </span>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })
                )}
              </div>

              <div className="space-y-2">
                <input
                  type="text"
                  value={newExamName}
                  onChange={(e) => setNewExamName(e.target.value)}
                  onKeyDown={(e) => handleKeyPress(e, addExam)}
                  className="w-full p-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm"
                  placeholder="Exam name..."
                />
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={newExamDate}
                    onChange={(e) => setNewExamDate(e.target.value)}
                    onKeyDown={(e) => handleKeyPress(e, addExam)}
                    className="flex-1 p-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm"
                  />
                  <button
                    onClick={addExam}
                    className="px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 transition text-sm"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}