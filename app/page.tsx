'use client';

import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { supabase, User, Message as DbMessage, Exam as DbExam, StudyGroup, generateGroupCode, signUp, signIn, signOut, resetPassword, getCurrentUser } from '../lib/supabase';

// NodeJS types polyfill for linter
declare global {
  namespace NodeJS {
    interface Timeout { }
  }
}

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
  children: ReactNode;
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
  const [groupScreen, setGroupScreen] = useState<'select' | 'create' | 'join' | 'lobby'>('select');
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

  // Channel ref for broadcasting group events (chat, timer, etc)
  const groupChannelRef = useRef<any>(null);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const [isChannelReady, setIsChannelReady] = useState(false);

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

  // Refs to avoid effect restarts (Deeper Stability)
  const userNameRef = useRef(userName);
  const currentUserRef = useRef(currentUser);
  const isGroupCreatorRef = useRef(isGroupCreator);
  const useSyncedTimerRef = useRef(useSyncedTimer);
  const chatSoundEnabledRef = useRef(chatSoundEnabled);
  const timerStateRef = useRef(timerState);
  const secondsRef = useRef(seconds);
  const cycleCountRef = useRef(cycleCount);

  useEffect(() => { userNameRef.current = userName; }, [userName]);
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);
  useEffect(() => { isGroupCreatorRef.current = isGroupCreator; }, [isGroupCreator]);
  useEffect(() => { useSyncedTimerRef.current = useSyncedTimer; }, [useSyncedTimer]);
  useEffect(() => { chatSoundEnabledRef.current = chatSoundEnabled; }, [chatSoundEnabled]);
  useEffect(() => { timerStateRef.current = timerState; }, [timerState]);
  useEffect(() => { secondsRef.current = seconds; }, [seconds]);
  useEffect(() => { cycleCountRef.current = cycleCount; }, [cycleCount]);

  // 1. Static Data Loading (Runs once per group change)
  useEffect(() => {
    if (!currentUser || !currentGroup) return;

    const loadInitialData = async () => {
      console.log('📦 Loading initial group data...');
      // Load messages
      const { data: msgData } = await supabase.from('messages').select('*').eq('group_id', currentGroup.id).order('created_at', { ascending: true }).limit(200);
      if (msgData) setMessages(msgData.map((m: DbMessage) => ({ id: m.id, user: m.user_name, text: m.text, isSystem: m.is_system, timestamp: new Date(m.created_at) })));

      // Load users
      const { data: userData } = await supabase.from('users').select('*').eq('group_id', currentGroup.id);
      if (userData) {
        setAllUsers(userData);
        setFriends(userData.filter(u => u.auth_id !== currentUser?.auth_id).map(u => ({ id: u.id, name: u.name, status: u.status, streak: u.streak, lastSeen: new Date(u.created_at) })));
      }

      // Load exams
      const { data: examData } = await supabase.from('exams').select('*').eq('group_id', currentGroup.id);
      if (examData) setExams(examData.map((e: DbExam) => ({ id: e.id, name: e.name, date: new Date(e.date) })));
    };

    loadInitialData();
  }, [currentGroup?.id, currentUser?.auth_id]);

  // 2. Realtime Subscription (STABLE: only depends on group ID)
  useEffect(() => {
    if (!currentGroup?.id) return;

    console.log(`📡 REALTIME: Establishing stable connection to group [${currentGroup.id}]`);
    
    // Reset channel ready state
    setIsChannelReady(false);
    
    const channel = supabase.channel(`group-${currentGroup.id}`, {
      config: { 
        broadcast: { self: false },
        presence: { key: currentUser?.id || 'anonymous' }
      }
    });

    // Store channel ref immediately
    groupChannelRef.current = channel;
    console.log('📌 Channel stored in ref');

    // Log channel state changes
    channel.on('system', {}, (payload) => {
      console.log('🔧 Channel system event:', payload);
    });

    channel
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `group_id=eq.${currentGroup.id}` }, (payload) => {
        console.log('📥 DB: New Message detected', payload.new);
        const m = payload.new as DbMessage;
        setMessages((prev) => {
          if (prev.some(msg => msg.id === m.id)) return prev;
          const timeDiff = 10000;
          const optimisticIndex = prev.findIndex(msg =>
            msg.text === m.text && msg.user === m.user_name &&
            Math.abs(msg.timestamp.getTime() - new Date(m.created_at).getTime()) < timeDiff
          );
          if (optimisticIndex !== -1) {
            const updated = [...prev];
            updated[optimisticIndex] = { id: m.id, user: m.user_name, text: m.text, isSystem: m.is_system, timestamp: new Date(m.created_at) };
            return updated;
          }
          return [...prev, { id: m.id, user: m.user_name, text: m.text, isSystem: m.is_system, timestamp: new Date(m.created_at) }];
        });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'users', filter: `group_id=eq.${currentGroup.id}` }, (payload) => {
        const u = payload.new as User;
        if (u.id !== currentUserRef.current?.id) {
          setFriends(prev => prev.map(f => f.id === u.id ? { ...f, status: u.status, streak: u.streak } : f));
          setAllUsers(prev => prev.map(user => user.id === u.id ? u : user));
        }
      })
      .on('broadcast', { event: 'new-message' }, (payload) => {
        console.log('⚡ BROADCAST: New Message received', payload.payload);
        const m = payload.payload;
        if (m.user !== userNameRef.current) {
          setMessages((prev) => {
            if (prev.some(msg => msg.id === m.id)) return prev;
            if (!m.isSystem && chatSoundEnabledRef.current) getAudioManager()?.playNotification();
            return [...prev, { id: m.id, user: m.user, text: m.text, isSystem: m.isSystem, timestamp: new Date(m.timestamp) }];
          });
        }
      })
      .on('broadcast', { event: 'request-timer-sync' }, async (payload) => {
        console.log('📥 Received timer-sync request from:', payload.payload.requesterName);
        // If I'm the creator, broadcast current timer state
        if (isGroupCreatorRef.current && groupChannelRef.current) {
          const currentState = {
            timerState: timerStateRef.current,
            seconds: secondsRef.current,
            cycleCount: cycleCountRef.current,
            changedById: currentUserRef.current?.id,
            changedByName: userNameRef.current
          };
          console.log('📡 Creator sending current timer state:', currentState);
          await groupChannelRef.current.send({
            type: 'broadcast',
            event: 'timer-sync',
            payload: currentState,
          });
        }
      })
      .on('broadcast', { event: 'timer-tick' }, (payload) => {
        console.log('📥 Received timer-tick:', payload.payload, { isCreator: isGroupCreatorRef.current, synced: useSyncedTimerRef.current });
        if (!isGroupCreatorRef.current && useSyncedTimerRef.current) {
          console.log('✅ Applying timer-tick update');
          setSeconds(payload.payload.seconds);
          setTimerState(payload.payload.timerState);
        }
      })
      .on('broadcast', { event: 'timer-sync' }, (payload) => {
        console.log('⚡ BROADCAST: Timer sync received', payload.payload);
        const { timerState: ns, seconds: nsec, cycleCount: ncc, changedById } = payload.payload;
        if (changedById !== currentUserRef.current?.id && !isGroupCreatorRef.current && useSyncedTimerRef.current) {
          setTimerState(ns); setSeconds(nsec); if (ncc !== undefined) setCycleCount(ncc);
          const audio = getAudioManager();
          if (ns === 'focus') audio?.focusStart();
          else if (ns === 'break') audio?.shortBreak();
          else if (ns === 'idle') audio?.stopTicking();
        }
      })
      .on('broadcast', { event: 'settings-change' }, (payload) => {
        console.log('⚡ BROADCAST: Settings changed', payload.payload);
        if (payload.payload.changedById !== currentUserRef.current?.id && !isGroupCreatorRef.current && useSyncedTimerRef.current) {
          setSettings(payload.payload.settings);
        }
      })
      .on('broadcast', { event: 'exam-update' }, () => {
        console.log('⚡ BROADCAST: Exam update received');
        supabase.from('exams').select('*').eq('group_id', currentGroup.id).then(({ data }) => {
          if (data) setExams(data.map((e: DbExam) => ({ id: e.id, name: e.name, date: new Date(e.date) })));
        });
      })
      .on('broadcast', { event: 'group-deleted' }, () => window.location.reload())
      .subscribe((status) => {
        console.log(`🔌 Realtime Status: ${status}, Channel State: ${channel.state}`);
        const isSubscribed = status === 'SUBSCRIBED';
        setIsRealtimeConnected(isSubscribed);
        
        if (isSubscribed) {
          console.log('✅ Realtime channel SUBSCRIBED - Channel State:', channel.state);
          // Check if channel is actually in 'joined' state
          if (channel.state === 'joined') {
            console.log('✅ Channel in JOINED state - ready for broadcasts!');
            setIsChannelReady(true);
          } else {
            // Wait a moment for the channel to reach joined state
            setTimeout(() => {
              console.log('⏰ Delayed check - Channel State:', channel.state);
              if (channel.state === 'joined') {
                console.log('✅ Channel ready for broadcasts!');
                setIsChannelReady(true);
              } else {
                console.error('❌ Channel not in joined state after delay:', channel.state);
              }
            }, 1000);
          }
        } else {
          setIsChannelReady(false);
          if (status === 'CLOSED') {
            console.warn('⚠️ Realtime channel CLOSED');
          } else if (status === 'CHANNEL_ERROR') {
            console.error('❌ Realtime channel ERROR - State:', channel.state);
          }
        }
      });

    return () => {
      console.log('🔌 Realtime: Closing stable connection');
      supabase.removeChannel(channel);
      setIsRealtimeConnected(false);
      setIsChannelReady(false);
      groupChannelRef.current = null;
    };
  }, [currentGroup?.id]);

  // Fallback: Poll for new messages when realtime connection fails
  useEffect(() => {
    if (!currentGroup?.id || isRealtimeConnected) return;

    console.log('⚠️ Realtime disconnected - enabling message polling fallback');
    
    const pollMessages = async () => {
      try {
        const { data: msgData } = await supabase
          .from('messages')
          .select('*')
          .eq('group_id', currentGroup.id)
          .order('created_at', { ascending: true });
        
        if (msgData) {
          // Just replace all messages with fresh data from DB
          const allMessages = msgData.map((m: DbMessage) => ({
            id: m.id,
            user: m.user_name,
            text: m.text,
            isSystem: m.is_system,
            timestamp: new Date(m.created_at)
          }));
          
          setMessages(prev => {
            // Check if there are new messages and play sound
            const newMsgs = allMessages.filter(m => !prev.some(p => p.id === m.id));
            if (newMsgs.length > 0) {
              // Play sound for non-system messages from other users
              const shouldPlaySound = newMsgs.some(m => !m.isSystem && m.user !== userNameRef.current);
              if (shouldPlaySound && chatSoundEnabledRef.current) {
                getAudioManager()?.playNotification();
              }
            }
            return allMessages;
          });
          console.log(`📥 Polling: Loaded ${allMessages.length} total messages from DB`);
        }
      } catch (err) {
        console.error('❌ Polling error:', err);
      }
    };

    // Poll immediately
    console.log('🔄 Starting polling - first poll now');
    pollMessages();

    // Poll every 2 seconds when disconnected (faster for better UX)
    const interval = setInterval(() => {
      console.log('🔄 Polling interval tick...');
      pollMessages();
    }, 2000);
    
    console.log('✅ Polling interval set up');
    
    return () => {
      console.log('🛑 Stopping polling');
      clearInterval(interval);
    };
  }, [currentGroup?.id, isRealtimeConnected]);

  const addSystemMessage = useCallback(
    async (text: string, overrideUser?: User | null, overrideGroup?: StudyGroup | null) => {
      const u = overrideUser !== undefined ? overrideUser : currentUser;
      const g = overrideGroup !== undefined ? overrideGroup : currentGroup;

      if (!u || !g) return;

      const tempId = 'sys-' + Math.random().toString(36).substring(2, 9);
      const timestamp = new Date();

      const systemMsg = {
        id: tempId,
        user: 'System',
        text,
        isSystem: true,
        timestamp,
      };

      // Optimistic/Local update
      setMessages(prev => [...prev, systemMsg]);

      // Broadcast
      if (groupChannelRef.current) {
        groupChannelRef.current.send({
          type: 'broadcast',
          event: 'new-message',
          payload: systemMsg,
        });
      }

      await supabase.from('messages').insert({
        user_id: u.id,
        user_name: 'System',
        group_id: g.id,
        text,
        is_system: true,
      });
    },
    [currentUser, currentGroup]
  );

  const updateUserStatus = useCallback(
    async (status: User['status'], streak?: number) => {
      if (!currentUser) return;

      const updates: Partial<User> & { updated_at?: string } = { status, updated_at: new Date().toISOString() };
      if (streak !== undefined) updates.streak = streak;

      await supabase.from('users').update(updates).eq('id', currentUser.id);
    },
    [currentUser]
  );

  // Heartbeat to track user and group activity - updates every 5 minutes
  useEffect(() => {
    if (!currentUser || !currentGroup) return;

    const heartbeat = async () => {
      const now = new Date().toISOString();
      // Update user activity
      await supabase.from('users').update({ updated_at: now }).eq('id', currentUser.id);
      // Update group activity
      await supabase.from('study_groups').update({ updated_at: now }).eq('id', currentGroup.id);
    };

    // Initial heartbeat
    heartbeat();

    // Send heartbeat every 5 minutes
    const interval = setInterval(heartbeat, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [currentUser, currentGroup]);

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
          await addSystemMessage(`⏰ ${name} was removed due to 30 minutes of inactivity.`);
        }
      }
    };

    // Initial check
    checkInactiveUsers();

    // Check every minute
    const interval = setInterval(checkInactiveUsers, 60 * 1000);

    return () => clearInterval(interval);
  }, [currentGroup, currentUser]);

  // When a non-creator joins with synced timer, sync to current timer state
  useEffect(() => {
    if (!currentGroup || !currentUser || isGroupCreator || !useSyncedTimer) return;

    console.log('🔄 Non-creator synced user - waiting for timer sync...');
    
    // Request current timer state via broadcast
    const requestSync = async () => {
      if (groupChannelRef.current) {
        console.log('📡 Requesting timer sync from creator');
        await groupChannelRef.current.send({
          type: 'broadcast',
          event: 'request-timer-sync',
          payload: { requesterId: currentUser.id, requesterName: userName },
        });
      }
    };

    // Wait a bit for channel to be ready, then request sync
    const timeout = setTimeout(requestSync, 1000);
    return () => clearTimeout(timeout);
  }, [currentGroup?.id, currentUser?.id, isGroupCreator, useSyncedTimer]);

  // Broadcast timer tick to group members (group creator only)
  useEffect(() => {
    if (!currentGroup || !isGroupCreator || timerState === 'idle' || !isChannelReady) {
      if (isGroupCreator && timerState !== 'idle' && !isChannelReady) {
        console.log('⏳ Waiting for channel to be ready before broadcasting...');
      }
      return;
    }

    console.log('📡 Timer broadcast enabled:', { timerState, seconds, isGroupCreator, isChannelReady });

    const broadcastTick = async () => {
      if (groupChannelRef.current) {
        try {
          const channelState = groupChannelRef.current.state;
          console.log('📡 Broadcasting timer-tick:', { seconds, timerState, channelState });
          const result = await groupChannelRef.current.send({
            type: 'broadcast',
            event: 'timer-tick',
            payload: { seconds, timerState },
          });
          console.log('📡 Broadcast result:', result);
        } catch (error) {
          console.error('❌ Broadcast error:', error);
        }
      } else {
        console.warn('⚠️ Cannot broadcast: No group channel');
      }
    };

    // Initial broadcast
    broadcastTick();

    // Broadcast every second
    const interval = setInterval(broadcastTick, 1000);

    return () => clearInterval(interval);
  }, [currentGroup, isGroupCreator, timerState, seconds, isChannelReady]);

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
      if (currentGroup && isGroupCreator && groupChannelRef.current) {
        groupChannelRef.current.send({
          type: 'broadcast',
          event: 'timer-sync',
          payload: { timerState: 'lostInBreak', seconds: 0, cycleCount: cycleCount, changedById: user?.id, changedByName: userName },
        });
      }
    }

    return () => {
      if (interval) clearInterval(interval as unknown as number);
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
    const trimmedName = userName.trim();
    if (!trimmedName) return;
    if (!currentGroup) return;

    console.log('Creating user:', trimmedName);

    // Update userName to trimmed version to ensure consistency
    setUserName(trimmedName);

    await createNewUser();
  };

  const createNewUser = async () => {
    if (!userName.trim() || !currentGroup) {
      console.error('Cannot create user: missing userName or currentGroup');
      return;
    }
    
    if (!user || !user.id) {
      console.error('Cannot create user: user is not authenticated');
      alert('Please sign in first to create a user profile');
      setShowAuth(true);
      return;
    }

    setNameError('');
    setShowNameConfirm(false);

    // Check for duplicate names in this group
    console.log('Checking for duplicate name in group:', userName);
    const { data: existingNames, error: nameCheckError } = await supabase
      .from('users')
      .select('id, name, auth_id')
      .eq('group_id', currentGroup.id)
      .ilike('name', userName.trim());

    if (nameCheckError) {
      console.error('Error checking for duplicate names:', nameCheckError);
    } else if (existingNames && existingNames.length > 0) {
      // Check if any of the existing names belong to a different auth user
      const duplicateFromOtherUser = existingNames.find(u => u.auth_id !== user.id);
      if (duplicateFromOtherUser) {
        setNameError(`The name "${userName}" is already taken in this group. Please choose a different name.`);
        return;
      }
      // If it's the same auth user, allow them to use their existing profile
      const existingUserProfile = existingNames.find(u => u.auth_id === user.id);
      if (existingUserProfile) {
        console.log('User already has a profile in this group with this name');
        setExistingUserId(existingUserProfile.id);
        setShowNameConfirm(true);
        return;
      }
    }

    console.log('Creating new user with:', { auth_id: user.id, name: userName, group_id: currentGroup.id });

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

    console.log('Create user result:', { data, error, userData: data });

    if (error) {
      console.error('Error creating user:', error);
      console.error('Full error object:', JSON.stringify(error, null, 2));
      // Check if it's a duplicate key error
      if (error.message?.includes('duplicate') || error.code === '23505') {
        setNameError('This name is already taken in this group. Please choose a different name.');
      } else {
        setNameError(`Error: ${error.message || 'Unknown error occurred'}`);
        alert('Error creating user: ' + error.message);
      }
      return;
    }

    if (!data) {
      console.error('No data returned from user creation');
      setNameError('Failed to create user - no data returned');
      return;
    }

    if (data) {
      console.log('✅ SUCCESS! Setting currentUser to:', data);
      console.log('✅ Setting isNameSet to TRUE');
      setCurrentUser(data);
      setIsNameSet(true);
      console.log('✅ Name is set! Main app should now be visible');

      // Auto-set study target to group topic
      if (currentGroup?.topic) {
        setStudyTarget(currentGroup.topic);
      }

      // Send welcome message
      await addSystemMessage(`👋 ${userName} joined the study group!`, data, currentGroup);
      console.log('✅ Welcome message sent');
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
    await addSystemMessage(`👋 ${userName} is back!`, { ...existingUser, status: 'online' } as User, currentGroup);
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
    if (currentGroup && isGroupCreator && groupChannelRef.current) {
      console.log('📡 Broadcasting timer-sync (start focus):', { timerState: 'focus', seconds: focusSeconds, cycleCount });
      await groupChannelRef.current.send({
        type: 'broadcast',
        event: 'timer-sync',
        payload: { timerState: 'focus', seconds: focusSeconds, cycleCount, changedById: user?.id, changedByName: userName },
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
    if (currentGroup && isGroupCreator && groupChannelRef.current) {
      await groupChannelRef.current.send({
        type: 'broadcast',
        event: 'timer-sync',
        payload: { timerState: 'break', seconds: breakSeconds, cycleCount: cycle, changedById: user?.id, changedByName: userName },
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
    if (currentGroup && isGroupCreator && groupChannelRef.current) {
      await groupChannelRef.current.send({
        type: 'broadcast',
        event: 'timer-sync',
        payload: { timerState: 'focus', seconds: focusSeconds, cycleCount: cycleCount, changedById: user?.id, changedByName: userName },
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
    if (currentGroup && isGroupCreator && groupChannelRef.current) {
      await groupChannelRef.current.send({
        type: 'broadcast',
        event: 'timer-sync',
        payload: { timerState: 'idle', seconds: idleSeconds, cycleCount: 0, changedById: user?.id, changedByName: userName },
      });
    }
  };

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const sendMessage = async () => {
    console.log('sendMessage called', { 
      hasMessage: !!newMessage.trim(), 
      hasCurrentUser: !!currentUser, 
      hasCurrentGroup: !!currentGroup,
      currentUserId: currentUser?.id,
      groupId: currentGroup?.id 
    });
    
    if (!newMessage.trim()) {
      console.warn('Message is empty');
      return;
    }
    
    if (!currentUser) {
      console.error('Cannot send message: currentUser is null');
      alert('Please set your name first before sending messages');
      return;
    }
    
    if (!currentGroup) {
      console.error('Cannot send message: currentGroup is null');
      return;
    }

    const text = newMessage.trim();
    const tempId = 'msg-' + Math.random().toString(36).substring(2, 9);
    const timestamp = new Date();

    // Clear input immediately for better UX
    setNewMessage('');

    const chatMsg = {
      id: tempId,
      user: userName,
      text,
      isSystem: false,
      timestamp,
    };

    // 1. Optimistic local update
    setMessages(prev => [...prev, chatMsg]);

    // 2. Broadcast to peers immediately
    if (groupChannelRef.current) {
      try {
        await groupChannelRef.current.send({
          type: 'broadcast',
          event: 'new-message',
          payload: chatMsg,
        });
        console.log('Message broadcasted successfully');
      } catch (err) {
        console.error('Broadcast failed:', err);
      }
    } else {
      console.warn('No group channel available for broadcast');
    }

    // 3. Persist to DB in background
    try {
      const { data, error } = await supabase.from('messages').insert({
        user_id: currentUser.id,
        user_name: userName,
        group_id: currentGroup.id,
        text: text,
        is_system: false,
      }).select();
      
      if (error) {
        console.error('DB insert error:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        // Show user-friendly error
        alert(`Failed to send message: ${error.message}`);
      } else {
        console.log('Message persisted to DB successfully', data);
        
        // If realtime is disconnected, trigger immediate refresh
        if (!isRealtimeConnected) {
          console.log('🔄 Realtime disconnected - forcing immediate message refresh');
          setTimeout(async () => {
            const { data: msgData } = await supabase
              .from('messages')
              .select('*')
              .eq('group_id', currentGroup.id)
              .order('created_at', { ascending: true });
            if (msgData) {
              setMessages(msgData.map((m: DbMessage) => ({
                id: m.id,
                user: m.user_name,
                text: m.text,
                isSystem: m.is_system,
                timestamp: new Date(m.created_at)
              })));
              console.log(`✅ Forced refresh: Loaded ${msgData.length} messages`);
            }
          }, 500);
        }
      }
    } catch (err) {
      console.error('Failed to persist message:', err);
      alert('Failed to send message. Check console for details.');
    }
  };

  const addExam = async () => {
    if (!newExamName.trim() || !newExamDate || !currentUser || !currentGroup) return;

    const { data } = await supabase
      .from('exams')
      .insert({
        user_id: currentUser.id,
        group_id: currentGroup.id,
        name: newExamName,
        date: newExamDate,
      })
      .select()
      .single();

    if (data) {
      setExams((prev) => [...prev, { id: data.id, name: data.name, date: new Date(data.date) }]);
      // Save to localStorage as backup
      const updatedExams = [...exams, { id: data.id, name: data.name, date: new Date(data.date) }];
      localStorage.setItem(`exams_${currentGroup.id}`, JSON.stringify(updatedExams.map(e => ({ ...e, date: e.date.toISOString() }))));

      // Broadcast exam update to group
      if (groupChannelRef.current) {
        await groupChannelRef.current.send({
          type: 'broadcast',
          event: 'exam-update',
          payload: {},
        });
      }
    }

    setNewExamName('');
    setNewExamDate('');
  };

  const updateExam = async (examId: string) => {
    if (!editExamName.trim() || !editExamDate || !currentUser || !currentGroup) return;

    const { error } = await supabase
      .from('exams')
      .update({ name: editExamName, date: editExamDate })
      .eq('id', examId);

    if (!error) {
      setExams((prev) =>
        prev.map((e) =>
          e.id === examId ? { ...e, name: editExamName, date: new Date(editExamDate) } : e
        )
      );

      // Broadcast exam update to group
      if (groupChannelRef.current) {
        await groupChannelRef.current.send({
          type: 'broadcast',
          event: 'exam-update',
          payload: {},
        });
      }
    }

    setEditingExam(null);
    setEditExamName('');
    setEditExamDate('');
  };

  const deleteExam = async (examId: string) => {
    await supabase.from('exams').delete().eq('id', examId);
    setExams((prev) => prev.filter((e) => e.id !== examId));

    // Broadcast exam update to group
    if (currentGroup && groupChannelRef.current) {
      await groupChannelRef.current.send({
        type: 'broadcast',
        event: 'exam-update',
        payload: {},
      });
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

    // Broadcast settings change to all users in the group using the subscribed channel
    if (currentGroup && groupChannelRef.current) {
      await groupChannelRef.current.send({
        type: 'broadcast',
        event: 'settings-change',
        payload: {
          settings: tempSettings,
          changedById: user?.id,
          changedByName: userName,
        },
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

  const getLeaderboard = () => {
    const users = [
      { name: userName, streak: currentStreak },
      ...friends.map((f) => ({ name: f.name, streak: f.streak })),
    ];
    return users.sort((a, b) => b.streak - a.streak);
  };

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
                    // Provide helpful messages for common errors
                    if (error.message?.includes('already registered') || error.message?.includes('already exists')) {
                      setAuthError('This email is already registered. Please sign in instead.');
                    } else if (error.message?.includes('Password')) {
                      setAuthError(error.message + ' (minimum 6 characters)');
                    } else {
                      setAuthError(error.message || 'Failed to sign up');
                    }
                  } else {
                    console.log('SignUp successful');
                    setAuthError('✓ Account created! Check your email for confirmation link');
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
                    // Send logout message before removing user
                    if (currentUser && currentGroup) {
                      await addSystemMessage(`👋 ${currentUser.name} signed out.`);
                    }
                    
                    // Delete user from database (removes from group and leaderboard)
                    if (currentUser) {
                      await supabase.from('users').delete().eq('id', currentUser.id);
                      console.log('User removed from group:', currentUser.name);
                    }
                    
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
                // Prevent leading spaces and collapse multiple spaces
                const value = e.target.value.replace(/^\s+/, '').replace(/\s{2,}/g, ' ');
                setUserName(value);
                setNameError('');
                setShowNameConfirm(false);
              }}
              onBlur={(e) => {
                // Trim trailing spaces on blur
                setUserName(e.target.value.trim());
              }}
              onKeyDown={(e) => handleKeyPress(e, createUser)}
              className={`w-full p-3 rounded-lg bg-zinc-800 border ${nameError ? 'border-red-500' : 'border-zinc-700'} text-white mb-2`}
              placeholder="Your name"
              maxLength={50}
            />
            {userName.length >= 40 && (
              <p className="text-yellow-400 text-xs mb-1">Name is getting long ({userName.length}/50 characters)</p>
            )}
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
                // Prevent leading spaces and collapse multiple spaces
                const value = e.target.value.replace(/^\s+/, '').replace(/\s{2,}/g, ' ');
                setUserName(value);
                setNameError('');
                setShowNameConfirm(false);
              }}
              onBlur={(e) => {
                // Trim trailing spaces on blur
                setUserName(e.target.value.trim());
              }}
              onKeyDown={(e) => handleKeyPress(e, createUser)}
              className={`w-full p-3 rounded-lg bg-zinc-800 border ${nameError ? 'border-red-500' : 'border-zinc-700'} text-white mb-2`}
              placeholder="Your name"
              maxLength={50}
              autoFocus
            />
            {userName.length >= 40 && (
              <p className="text-yellow-400 text-xs mb-1">Name is getting long ({userName.length}/50 characters)</p>
            )}
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
                // Prevent leading spaces and collapse multiple spaces
                const value = e.target.value.replace(/^\s+/, '').replace(/\s{2,}/g, ' ');
                setUserName(value);
                setNameError('');
                setShowNameConfirm(false);
              }}
              onBlur={(e) => {
                // Trim trailing spaces on blur
                setUserName(e.target.value.trim());
              }}
              onKeyDown={(e) => handleKeyPress(e, createUser)}
              className={`w-full p-3 rounded-lg bg-zinc-800 border ${nameError ? 'border-red-500' : 'border-zinc-700'} text-white mb-2`}
              placeholder="Your name"
              maxLength={50}
            />
            {userName.length >= 40 && (
              <p className="text-yellow-400 text-xs mb-1">Name is getting long ({userName.length}/50 characters)</p>
            )}
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
                  // Send logout message before removing user
                  if (currentUser && currentGroup) {
                    await addSystemMessage(`👋 ${currentUser.name} signed out.`);
                  }
                  
                  // Delete user from database (removes from group and leaderboard)
                  if (currentUser) {
                    await supabase.from('users').delete().eq('id', currentUser.id);
                    console.log('User removed from group:', currentUser.name);
                  }
                  
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
              <div className="flex items-center gap-1.5" title={isRealtimeConnected ? "Realtime Connected" : "Realtime Disconnected"}>
                <div className={`w-2 h-2 rounded-full ${isRealtimeConnected ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]'}`} />
                <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Live</span>
              </div>
              {isGroupCreator && timerState !== 'idle' && (
                <>
                  <span className="text-zinc-600">•</span>
                  <div className="flex items-center gap-1.5" title="Broadcasting timer to group">
                    <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)] animate-pulse" />
                    <span className="text-[10px] uppercase tracking-wider text-blue-400 font-bold">📡</span>
                  </div>
                </>
              )}
              {!isGroupCreator && useSyncedTimer && (
                <>
                  <span className="text-zinc-600">•</span>
                  <div className="flex items-center gap-1.5" title="Synced with creator's timer">
                    <div className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.6)]" />
                    <span className="text-[10px] uppercase tracking-wider text-purple-400 font-bold">🔗</span>
                  </div>
                </>
              )}
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
                      className={`text-4xl font-mono font-bold ${timerState === 'lostInBreak'
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
                {/* Timer controls - disabled for synced non-creators */}
                {!isGroupCreator && useSyncedTimer ? (
                  <div className="w-full py-3 rounded-lg bg-zinc-800 border border-zinc-700 text-center">
                    <p className="text-sm text-zinc-400">
                      🔒 Timer controlled by group creator
                    </p>
                    <p className="text-xs text-zinc-500 mt-1">
                      Enable "Use Own Timer" below to control your own timer
                    </p>
                  </div>
                ) : (
                  <>
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
                  </>
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
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${useSyncedTimer
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
                    className={`w-full py-2 rounded-lg text-sm transition ${isGroupCreator
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
                    className={`flex justify-between items-center p-2 rounded-lg ${index === 0 ? 'bg-yellow-900/30' : 'bg-zinc-800'
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
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold">💬 Study Chat</h2>
                  {!isRealtimeConnected && (
                    <span className="text-xs px-2 py-1 bg-yellow-600 rounded-full" title="Messages updating every 3 seconds">
                      Polling
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  {!isRealtimeConnected && (
                    <button
                      onClick={async () => {
                        console.log('🔄 Manual refresh triggered');
                        const { data: msgData } = await supabase
                          .from('messages')
                          .select('*')
                          .eq('group_id', currentGroup!.id)
                          .order('created_at', { ascending: true });
                        if (msgData) {
                          setMessages(msgData.map((m: DbMessage) => ({
                            id: m.id,
                            user: m.user_name,
                            text: m.text,
                            isSystem: m.is_system,
                            timestamp: new Date(m.created_at)
                          })));
                          console.log(`✅ Loaded ${msgData.length} messages`);
                        }
                      }}
                      className="p-2 rounded-lg bg-blue-600 hover:bg-blue-700 transition-colors"
                      title="Refresh messages now"
                    >
                      🔄
                    </button>
                  )}
                  <button
                    onClick={() => setChatSoundEnabled(!chatSoundEnabled)}
                    className={`p-2 rounded-lg transition-colors ${chatSoundEnabled
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-zinc-700 hover:bg-zinc-600'
                      }`}
                    title={chatSoundEnabled ? 'Mute chat notifications' : 'Unmute chat notifications'}
                  >
                    {chatSoundEnabled ? '🔔' : '🔕'}
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 mb-4 max-h-96 flex flex-col-reverse">
                {[...messages].reverse().map((msg) => (
                  <div
                    key={msg.id}
                    className={`p-2 rounded-lg ${msg.isSystem
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
                      <div key={friend.id} className="flex justify-between items-center p-2 bg-zinc-800 rounded-lg gap-2">
                        <span className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full ${friend.status === 'focus'
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
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-zinc-400 capitalize">{friend.status}</span>
                          {isGroupCreator && (
                            <button
                              onClick={async () => {
                                if (!confirm(`Remove ${friend.name} from the group?`)) return;
                                
                                // Delete user from database (removes from group and leaderboard)
                                await supabase.from('users').delete().eq('id', friend.id);
                                
                                // Update local state
                                setFriends(prev => prev.filter(f => f.id !== friend.id));
                                setAllUsers(prev => prev.filter(u => u.id !== friend.id));
                                
                                // Send system message
                                await addSystemMessage(`🚫 ${friend.name} was removed from the group by ${userName}.`);
                              }}
                              className="text-xs px-2 py-0.5 rounded bg-red-600 hover:bg-red-700 transition"
                              title="Remove user"
                            >
                              ✕
                            </button>
                          )}
                        </div>
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
                  await addSystemMessage(`🌟 ${userName} started a new study session!`);
                }}
                className="w-full py-2 rounded-lg text-sm bg-purple-600 hover:bg-purple-700 transition"
              >
                🚀 Start a New Session
              </button>

              <button
                onClick={async () => {
                  if (!currentUser || !currentGroup) return;

                  // Send leave message
                  await addSystemMessage(`👋 ${userName} left the group.`);

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
                    if (groupChannelRef.current) {
                      await groupChannelRef.current.send({
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
                          className={`p-3 rounded-lg ${daysUntil <= 3 ? 'bg-red-900/50 border border-red-700' : 'bg-zinc-800'
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
                                  className={`font-semibold ${daysUntil <= 3 ? 'text-red-400' : daysUntil <= 7 ? 'text-yellow-400' : 'text-emerald-400'
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