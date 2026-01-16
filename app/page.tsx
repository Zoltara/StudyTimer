'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, User, Message as DbMessage, Exam as DbExam, StudyGroup, generateGroupCode } from '../lib/supabase';

// Audio file paths
const AUDIO_FILES = {
  start: '/audio/Pomodoro start.wav',
  ticking: '/audio/Pomodoro clock ticking.mp3',
  shortBreak: '/audio/Pomodoro  break.wav',
  longBreak: '/audio/Pomodoro long break.wav',
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
  const [userName, setUserName] = useState('');
  const [nameError, setNameError] = useState('');
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
  const [publicGroups, setPublicGroups] = useState<StudyGroup[]>([]);
  const [showGroupCode, setShowGroupCode] = useState(false);

  // Timer settings
  const [settings, setSettings] = useState<TimerSettings>(DEFAULT_SETTINGS);
  const [editingSettings, setEditingSettings] = useState(false);
  const [tempSettings, setTempSettings] = useState<TimerSettings>(DEFAULT_SETTINGS);
  const [settingsWarning, setSettingsWarning] = useState<string | null>(null);

  // Smooth progress for circular bar
  const [smoothProgress, setSmoothProgress] = useState(1);
  const lastTickRef = useRef<number>(Date.now());
  const animationFrameRef = useRef<number | null>(null);

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
          if (u.status !== 'offline') return true;
          const updatedAt = new Date(u.updated_at || u.created_at);
          const minutesOffline = (now.getTime() - updatedAt.getTime()) / (1000 * 60);
          return minutesOffline < 10;
        });
        setAllUsers(activeUsers);
        setFriends(
          activeUsers.map((u: User & { updated_at?: string }) => ({
            id: u.id,
            name: u.name,
            status: u.status,
            streak: u.streak,
            lastSeen: new Date(u.updated_at || u.created_at),
          }))
        );
      }
    };

    // Load exams
    const loadExams = async () => {
      const { data } = await supabase.from('exams').select('*').eq('user_id', currentUser.id);
      if (data && data.length > 0) {
        const loadedExams = data.map((e: DbExam) => ({
          id: e.id,
          name: e.name,
          date: new Date(e.date),
        }));
        setExams(loadedExams);
        // Save to localStorage as backup
        localStorage.setItem(`exams_${currentUser.id}`, JSON.stringify(loadedExams.map(e => ({ ...e, date: e.date.toISOString() }))));
      } else {
        // Try loading from localStorage as fallback
        const stored = localStorage.getItem(`exams_${currentUser.id}`);
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

    // Subscribe to new messages
    const messagesChannel = supabase
      .channel('messages-channel')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const m = payload.new as DbMessage;
          // Play notification sound for messages from others (not system, not self)
          if (!m.is_system && m.user_name !== userName && chatSoundEnabled) {
            getAudioManager()?.playSound(AUDIO_FILES.start);
          }
          setMessages((prev) => [
            ...prev,
            {
              id: m.id,
              user: m.user_name,
              text: m.text,
              isSystem: m.is_system,
              timestamp: new Date(m.created_at),
            },
          ]);
        }
      )
      .subscribe();

    // Subscribe to user status changes
    const usersChannel = supabase
      .channel('users-channel')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'users' },
        (payload) => {
          const u = payload.new as User;
          if (u.id !== currentUser.id) {
            setFriends((prev) =>
              prev.map((f) =>
                f.id === u.id ? { ...f, status: u.status, streak: u.streak } : f
              )
            );
            setAllUsers((prev) => prev.map((user) => (user.id === u.id ? u : user)));
          }
        }
      )
      .subscribe();

    // Subscribe to timer settings changes (broadcast)
    const settingsChannel = supabase
      .channel('settings-channel')
      .on('broadcast', { event: 'settings-change' }, (payload) => {
        const { settings: newSettings, changedBy } = payload.payload as {
          settings: TimerSettings;
          changedBy: string;
        };
        // Only update if it's from someone else
        if (changedBy !== userName) {
          setSettings(newSettings);
          if (timerState === 'idle') {
            setSeconds(newSettings.focusTime * 60);
          }
          setSettingsWarning(`⚠️ Timer Changed by ${changedBy}`);
          // Auto-hide warning after 5 seconds
          setTimeout(() => setSettingsWarning(null), 5000);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(usersChannel);
      supabase.removeChannel(settingsChannel);
    };
  }, [currentUser, userName, timerState]);

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

      const updates: Partial<User> = { status };
      if (streak !== undefined) updates.streak = streak;

      await supabase.from('users').update(updates).eq('id', currentUser.id);
    },
    [currentUser]
  );

  // Timer logic
  useEffect(() => {
    let interval: NodeJS.Timeout | undefined;

    if (timerState === 'focus' && seconds > 0) {
      interval = setInterval(() => setSeconds((s) => s - 1), 1000);
    } else if (timerState === 'focus' && seconds === 0) {
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
    } else if (timerState === 'break' && seconds > 0) {
      interval = setInterval(() => setSeconds((s) => s - 1), 1000);
    } else if (timerState === 'break' && seconds === 0) {
      // Break time exceeded
      getAudioManager()?.stopTicking();
      setTimerState('lostInBreak');
      addSystemMessage(`⚠️ ${userName} lost in break`);
      updateUserStatus('offline');
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [timerState, seconds, userName, currentStreak, cycleCount, addSystemMessage, updateUserStatus, settings]);

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
        setPublicGroups(data);
      }
    };
    loadPublicGroups();
    
    // Refresh every 30 seconds
    const interval = setInterval(loadPublicGroups, 30000);
    return () => clearInterval(interval);
  }, []);

  const createGroup = async () => {
    if (!groupName.trim() || !groupTopic.trim()) return;
    
    const code = generateGroupCode();
    const { data, error } = await supabase
      .from('study_groups')
      .insert({
        code,
        name: groupName,
        topic: groupTopic,
        created_by: userName,
        is_public: isPublicGroup,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating group:', error);
      return;
    }

    if (data) {
      setCurrentGroup(data);
      setGroupScreen('lobby');
    }
  };

  const joinGroup = async (code?: string) => {
    const codeToUse = code || joinCode.trim().toUpperCase();
    if (!codeToUse) return;

    const { data, error } = await supabase
      .from('study_groups')
      .select('*')
      .eq('code', codeToUse)
      .single();

    if (error || !data) {
      setJoinError('Group not found. Please check the code.');
      return;
    }

    setCurrentGroup(data);
    setJoinError('');
    setGroupScreen('lobby');
  };

  const createUser = async () => {
    if (!userName.trim()) return;
    if (!currentGroup) return;

    console.log('Creating user:', userName);

    // Check if name already exists in this group
    const { data: existingUsers } = await supabase
      .from('users')
      .select('id')
      .eq('group_id', currentGroup.id)
      .ilike('name', userName.trim());

    if (existingUsers && existingUsers.length > 0) {
      setNameError('This user already exists, please select another name.');
      return;
    }

    setNameError('');

    const { data, error } = await supabase
      .from('users')
      .insert({ 
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
    setSeconds(settings.focusTime * 60);
    setTimerState('focus');
    await updateUserStatus('focus');
    const targetText = studyTarget ? ` on ${studyTarget}` : '';
    await addSystemMessage(`🎯 ${userName} started focusing${targetText}!`);
  };

  const startBreak = (cycle: number) => {
    const audio = getAudioManager();
    const isLongBreak = cycle > 0 && cycle % settings.cyclesBeforeLongBreak === 0;
    if (isLongBreak) {
      audio?.longBreak();
    } else {
      audio?.shortBreak();
    }
    const breakTime = isLongBreak ? settings.longBreakTime : settings.shortBreakTime;
    setSeconds(breakTime * 60);
    setTimerState('break');
    const breakType = isLongBreak ? 'long break' : 'short break';
    addSystemMessage(`☕ ${userName} on a ${breakType} (${breakTime} min)`);
  };

  const backFromBreak = async () => {
    // Automatically continue to next focus cycle
    const audio = getAudioManager();
    audio?.focusStart();
    // Play ticking sound once after start sound
    setTimeout(() => audio?.playSound(AUDIO_FILES.ticking), 500);
    setSeconds(settings.focusTime * 60);
    setTimerState('focus');
    await updateUserStatus('focus');
    const targetText = studyTarget ? ` on ${studyTarget}` : '';
    await addSystemMessage(`✅ ${userName} is back from break! Starting cycle #${cycleCount + 1}${targetText}`);
  };

  const quitSession = async () => {
    getAudioManager()?.stopTicking();
    if (timerState === 'focus') {
      await addSystemMessage(`❌ ${userName} is out.`);
      setCurrentStreak(0);
      await updateUserStatus('online', 0);
    }
    setTimerState('idle');
    setSeconds(settings.focusTime * 60);
    setCycleCount(0);
  };

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !currentUser || !currentGroup) return;

    await supabase.from('messages').insert({
      user_id: currentUser.id,
      user_name: userName,
      group_id: currentGroup.id,
      text: newMessage,
      is_system: false,
    });

    setNewMessage('');
  };

  const addExam = async () => {
    if (!newExamName.trim() || !newExamDate || !currentUser) return;

    const { data } = await supabase
      .from('exams')
      .insert({
        user_id: currentUser.id,
        name: newExamName,
        date: newExamDate,
      })
      .select()
      .single();

    if (data) {
      setExams((prev) => [...prev, { id: data.id, name: data.name, date: new Date(data.date) }]);
      // Save to localStorage as backup
      const updatedExams = [...exams, { id: data.id, name: data.name, date: new Date(data.date) }];
      localStorage.setItem(`exams_${currentUser.id}`, JSON.stringify(updatedExams.map(e => ({ ...e, date: e.date.toISOString() }))));
    }

    setNewExamName('');
    setNewExamDate('');
  };

  const updateExam = async (examId: string) => {
    if (!editExamName.trim() || !editExamDate || !currentUser) return;

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
    }

    setEditingExam(null);
    setEditExamName('');
    setEditExamDate('');
  };

  const deleteExam = async (examId: string) => {
    await supabase.from('exams').delete().eq('id', examId);
    setExams((prev) => prev.filter((e) => e.id !== examId));
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

    // Broadcast settings change to all users
    await supabase.channel('settings-channel').send({
      type: 'broadcast',
      event: 'settings-change',
      payload: {
        settings: tempSettings,
        changedBy: userName,
      },
    });

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

  // Group Selection Screen
  if (!currentGroup) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 text-white p-4">
        <h1 className="text-5xl font-bold mb-4 text-emerald-500">StudyTimer</h1>
        <p className="text-xl text-zinc-400 mb-8">Stay focused with your friends.</p>

        {groupScreen === 'select' && (
          <div className="w-full max-w-md space-y-4">
            <button
              onClick={() => setGroupScreen('create')}
              className="w-full py-4 rounded-xl font-semibold bg-emerald-600 hover:bg-emerald-700 transition text-lg"
            >
              🚀 Create New Group
            </button>
            <button
              onClick={() => setGroupScreen('join')}
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
                        <div className="text-xs text-zinc-500">by {group.created_by}</div>
                      </div>
                      <button
                        onClick={() => joinGroup(group.code)}
                        className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 transition text-sm"
                      >
                        Join
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
              disabled={!groupName.trim() || !groupTopic.trim()}
              className="w-full py-3 rounded-lg font-semibold bg-emerald-600 hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create Group
            </button>
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

        {groupScreen === 'lobby' && currentGroup && (
          <div className="bg-zinc-900 p-8 rounded-2xl border border-zinc-800 w-full max-w-md">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold">{currentGroup.name}</h2>
              <p className="text-zinc-400">📚 {currentGroup.topic}</p>
            </div>
            
            <div className="bg-zinc-800 p-4 rounded-xl mb-6 text-center">
              <p className="text-sm text-zinc-400 mb-2">Share this code with friends:</p>
              <div className="text-3xl font-bold tracking-widest text-emerald-400 mb-2">
                {currentGroup.code}
              </div>
              <button
                onClick={copyGroupCode}
                className="text-sm text-zinc-400 hover:text-white"
              >
                {showGroupCode ? '✓ Copied!' : '📋 Copy Code'}
              </button>
            </div>
            
            <label className="block text-sm text-zinc-400 mb-2">Enter your name</label>
            <input
              type="text"
              value={userName}
              onChange={(e) => {
                setUserName(e.target.value);
                setNameError('');
              }}
              onKeyDown={(e) => handleKeyPress(e, createUser)}
              className={`w-full p-3 rounded-lg bg-zinc-800 border ${nameError ? 'border-red-500' : 'border-zinc-700'} text-white mb-2`}
              placeholder="Your name"
            />
            {nameError && (
              <p className="text-red-400 text-sm mb-2">{nameError}</p>
            )}
            <button
              onClick={createUser}
              disabled={!userName.trim()}
              className="w-full py-3 rounded-lg font-semibold bg-emerald-600 hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Join & Start Studying
            </button>
            
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

  if (!isNameSet) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 text-white">
        <h1 className="text-5xl font-bold mb-4 text-emerald-500">StudyTimer</h1>
        <p className="text-xl text-zinc-400 mb-8">Stay focused with your friends.</p>
        <div className="bg-zinc-900 p-8 rounded-2xl border border-zinc-800 w-80">
          <label className="block text-sm text-zinc-400 mb-2">Enter your name</label>
          <input
            type="text"
            value={userName}
            onChange={(e) => {
              setUserName(e.target.value);
              setNameError('');
            }}
            onKeyDown={(e) => handleKeyPress(e, createUser)}
            className={`w-full p-3 rounded-lg bg-zinc-800 border ${nameError ? 'border-red-500' : 'border-zinc-700'} text-white mb-2`}
            placeholder="Your name"
          />
          {nameError && (
            <p className="text-red-400 text-sm mb-2">{nameError}</p>
          )}
          <button
            onClick={createUser}
            className="w-full py-3 rounded-lg font-semibold bg-emerald-600 hover:bg-emerald-700 transition"
          >
            Start Studying
          </button>
        </div>
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

      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-4xl font-bold text-emerald-500">StudyTimer</h1>
          {currentGroup && (
            <div className="flex items-center justify-center gap-2 mt-2">
              <span className="text-zinc-400">📚 {currentGroup.name}</span>
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
          <p className="text-zinc-400 mt-1">
            Welcome, {userName}! 🎯 Current Streak: {currentStreak} sessions
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

              {/* Timer Settings */}
              <div className="mt-4 pt-4 border-t border-zinc-800">
                {!editingSettings ? (
                  <button
                    onClick={() => {
                      setTempSettings(settings);
                      setEditingSettings(true);
                    }}
                    className="w-full py-2 rounded-lg text-sm bg-zinc-800 hover:bg-zinc-700 transition"
                  >
                    ⚙️ Timer Settings
                  </button>
                ) : (
                  <div className="space-y-3">
                    <div className="text-sm text-zinc-400 text-center">Timer Settings</div>
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

              <div className="flex-1 overflow-y-auto space-y-2 mb-4 max-h-96 flex flex-col-reverse">
                {[...messages].reverse().map((msg) => (
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