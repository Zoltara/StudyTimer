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
        // Filter out current user from friends list
        const otherUsers = data.filter((u: User) => u.id !== currentUser.id);
        setAllUsers(otherUsers);
setFriends(
          activeUsers.map((u: User & { updated_at?: string }) => ({
          otherUsers.map((u: User) => ({
id: u.id,
name: u.name,
status: u.status,
streak: u.streak,
            lastSeen: new Date(u.updated_at || u.created_at),
            lastSeen: new Date(u.created_at),
}))
);
}
@@ -700,141 +693,17 @@ export default function Home() {
async (status: User['status'], streak?: number) => {
if (!currentUser) return;

      const updates: Partial<User> & { updated_at?: string } = { status, updated_at: new Date().toISOString() };
      const updates: Partial<User> = { status };
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
  // Heartbeat removed - updated_at column doesn't exist in database

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
  // Inactive groups/users check removed - updated_at column doesn't exist in database

// Broadcast timer tick to group members (group creator only)
useEffect(() => {