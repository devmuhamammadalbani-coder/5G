import React, { createContext, useState, useContext, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../supabaseClient';
import Preloader from '../components/common/Preloader';
import auditLogger from '../utils/auditLogger';
import { toCamelCase, toSnakeCase } from '../utils/caseConverter';
import SupabaseSetupScreen from '../components/common/SupabaseSetupScreen';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [authSession, setAuthSession] = useState(null); // Tier 1: Supabase session
  const [user, setUser] = useState(null);               // Tier 2: fully authorized current logged-in user profile

  const [users, setUsers] = useState([]);               // all staff
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [isFirstRun, setIsFirstRun] = useState(false);

  // ── LOGOUT ──
  const logout = async () => {
    const currentUser = user;
    
    // 1. Clear session storage markers
    sessionStorage.removeItem('tier2Passed');
    sessionStorage.removeItem('tier2ProfileId');
    sessionStorage.removeItem('clinical_login_logged');
    
    // 2. Optimistically clear UI state
    setUser(null);
    setAuthSession(null);
    
    // 3. Mark offline in background
    if (currentUser?.id) {
       supabase.from('users').update({ is_online: false, last_seen: new Date().toISOString() }).eq('id', currentUser.id).then();
       auditLogger.log(currentUser, 'LOGOUT', 'AUTH', currentUser.id, `${currentUser.name} logged out manually`).catch(()=>{});
    }
    
    // 4. Force Supabase Sign Out
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("Signout error:", err);
    }
  };

  // ── LOGIN ──
  const login = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  // ── LOGIN WITH GOOGLE ──
  const loginWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google' });
    if (error) throw error;
  };

  // ── VERIFY ADMIN CREDENTIALS (TIER 2) ──
  const verifyAdminCredentials = async (usernameInput, passwordInput) => {
    if (!authSession) throw new Error("No active session. Please log in first.");

    const username = (usernameInput || '').trim();
    const password = (passwordInput || '').trim();

    // SUPER ADMIN OVERRIDE
    const isSuperAdminEmail = (username === 'muhammadbindaddy@gmail.com' || username === 'devmuhamammadalbani@gmail.com');
    if (isSuperAdminEmail && password === 'Rama##12') {
       const superAdminProfile = {
          email: authSession.user.email || username,
          username: username,
          password: password,
          name: authSession.user.user_metadata?.full_name || 'Super Administrator',
          role: 'Admin',
          isActive: true
       };
       // Hydrate the profile into the database
       await supabase.from('users').upsert([toSnakeCase({ id: authSession.user.id, ...superAdminProfile })]);
       sessionStorage.setItem('tier2Passed', 'true');
       sessionStorage.setItem('tier2ProfileId', authSession.user.id);
       setUser({ id: authSession.user.id, ...superAdminProfile });
       return;
    }

    // Try finding the user by email or username, and matching password
    const { data: usersData, error } = await supabase
        .from('users')
        .select('*')
        .or(`email.eq.${username.toLowerCase()},username.eq.${username}`)
        .eq('password', password);

    if (error || !usersData || usersData.length === 0) {
      throw new Error("Invalid Administrator-provided Username or Password.");
    }

    const docSnap = usersData[0];
    const profile = toCamelCase(docSnap);
    const originalDocId = profile.id;

    const activatedProfile = {
      ...profile,
      isActive: true,
      linkedUid: authSession.user.id,
      lastVerifiedAt: new Date().toISOString(),
      isOnline: true,
      lastSeen: new Date().toISOString()
    };

    // Link the new auth ID to the profile.
    if (originalDocId !== authSession.user.id) {
        // If IDs differ, we create/upsert under the new Auth UID and delete the old record
        await supabase.from('users').upsert([toSnakeCase({ ...activatedProfile, id: authSession.user.id })]);
        await supabase.from('users').delete().eq('id', originalDocId);
    } else {
        await supabase.from('users').update(toSnakeCase(activatedProfile)).eq('id', authSession.user.id);
    }

    auditLogger.log(activatedProfile, 'ACCESS', 'AUTH', authSession.user.id, `Linked profile ${profile.email} to UID ${authSession.user.id}`);

    const finalUser = { ...activatedProfile, id: authSession.user.id };
    sessionStorage.setItem('tier2Passed', 'true');
    setUser(finalUser);
  };

  // ── ADD USER (Admin provisions a new account) ──
  const addUser = async (newUser) => {
    // 1. Prevent Duplicates
    const { data: existing } = await supabase.from('users').select('*').eq('email', newUser.email.toLowerCase());
    if (existing && existing.length > 0) {
        throw new Error("A staff account with this email already exists.");
    }

    // 2. Create in Auth. In Supabase, if we call signUp, it logs us in.
    // To create a user WITHOUT logging in, we can either use admin SDK (server-side)
    // or just insert into the 'users' table and have the user use "Forgot Password".
    // We will just insert them into the users table with their raw password so they can log in at Tier 2.
    // They will need to sign up for real on their first login or we will use a serverless function later.
    // For now, we store them as pending.
    
    const cleanEmail = newUser.email.trim().toLowerCase();
    
    const { error } = await supabase.from('users').insert([toSnakeCase({
      email: cleanEmail,
      username: cleanEmail.split('@')[0],
      password: newUser.password,
      name: newUser.name,
      role: newUser.role,
      specialty: newUser.specialty || '',
      isActive: false,  // Always starts pending
      adminVerificationCode: newUser.adminVerificationCode || ''
    })]);

    if (error) throw new Error(error.message);
  };

  // ── TOGGLE STATUS ──
  const toggleUserStatus = async (userId) => {
    const { data: snap } = await supabase.from('users').select('is_active').eq('id', userId).single();
    if (snap) {
      await supabase.from('users').update({ is_active: !snap.is_active }).eq('id', userId);
    }
  };

  // ── UPDATE USER FIELD ──
  const updateUser = async (userId, fields) => {
    await supabase.from('users').update(toSnakeCase(fields)).eq('id', userId);
  };

  // ── DELETE USER ──
  const deleteUser = async (userId) => {
    await supabase.from('users').delete().eq('id', userId);
  };

  // ── DEEP CLEAN DUPLICATES (Admin Only) ──
  const cleanDuplicateUsers = async () => {
    // Simplified cleanup for Supabase
    const { data: usersData } = await supabase.from('users').select('*');
    if (!usersData) return 0;
    
    const emailGroups = {};
    usersData.forEach(d => {
        const email = (d.email || '').toLowerCase();
        if (!email) return;
        if (!emailGroups[email]) emailGroups[email] = [];
        emailGroups[email].push(d);
    });

    let count = 0;
    for (const group of Object.values(emailGroups)) {
        if (group.length > 1) {
            group.sort((a, b) => {
                if (a.is_active !== b.is_active) return b.is_active ? 1 : -1;
                if (!!a.linked_uid !== !!b.linked_uid) return a.linked_uid ? 1 : -1;
                return new Date(b.created_at || 0) - new Date(a.created_at || 0);
            });
            
            const toDelete = group.slice(1);
            for (const dupe of toDelete) {
                await supabase.from('users').delete().eq('id', dupe.id);
                count++;
            }
        }
    }
    return count;
  };

  // ── RESET PASSWORD ──
  const resetPassword = async (userProfile) => {
    const email = userProfile.email || `${userProfile.username.toLowerCase().replace(/\s+/g, '')}@sahara.local`;
    await supabase.auth.resetPasswordForEmail(email);
  };

  // ── Listen to users collection (real-time) ──
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    if (!authSession) {
      setUsers([]);
      return;
    }

    const fetchUsers = async () => {
        const { data } = await supabase.from('users').select('*');
        if (data) {
            const formatted = data.map(toCamelCase).map(u => {
                const lastSeenTime = u.lastSeen ? new Date(u.lastSeen).getTime() : 0;
                const isStale = (Date.now() - lastSeenTime) > 90000;
                return { ...u, isOnline: u.isOnline && !isStale };
            });
            setUsers(formatted);
            setIsFirstRun(formatted.length === 0);
        }
    };
    
    fetchUsers();

    const subscription = supabase
        .channel('public:users')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, fetchUsers)
        .subscribe();

    return () => {
        supabase.removeChannel(subscription);
    };
  }, [authSession]);

  // ── Listen to Supabase Auth state ──
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      try {
        if (session) {
          setAuthSession(session);
          
          let targetUid = sessionStorage.getItem('tier2ProfileId') || session.user.id;
          const { data: docSnap } = await supabase.from('users').select('*').eq('id', targetUid).single();

          if (!docSnap) {
             if (sessionStorage.getItem('tier2Passed') === 'true' && sessionStorage.getItem('tier2ProfileId') === session.user.id) {
                setUser(null); 
             } else {
                setUser(null);
             }
          } else {
            const profile = toCamelCase(docSnap);
            
            const isSystemOwner = session.user.email === 'muhammadbindaddy@gmail.com' || session.user.email === 'devmuhamammadalbani@gmail.com';
            const hasPassedSession = sessionStorage.getItem('tier2Passed') === 'true';
            
            if (profile.isActive || hasPassedSession || isSystemOwner) {
              if (!profile.isActive && profile.role !== 'Admin' && !isSystemOwner) {
                await supabase.auth.signOut();
                setAuthSession(null);
                setUser(null);
              } else {
                setUser(profile);
              }
            } else {
               setUser(null);
            }
          }
        } else {
          if (user) {
            auditLogger.log(user, 'LOGOUT', 'AUTH', user.id, `${user.name} logged out (session ended)`);
          }
          setAuthSession(null);
          setUser(null);
          sessionStorage.removeItem('tier2Passed');
          sessionStorage.removeItem('tier2ProfileId');
        }
      } catch (err) {
        console.error("Auth state error:", err);
        setAuthError(`Authentication service temporarily unavailable.`);
        setAuthSession(null);
        setUser(null);
      } finally {
        setAuthLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [user]); // user dependency ensures logging out with the correct user data

  // ── FOOLPROOF LOGIN AUDIT TRACKER ──
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    if (user && !sessionStorage.getItem('clinical_login_logged')) {
        auditLogger.log(user, 'LOGIN', 'AUTH', user.id, `${user.name} logged in (${user.email})`);
        sessionStorage.setItem('clinical_login_logged', 'true');
    }
    if (!user) {
        sessionStorage.removeItem('clinical_login_logged');
    }
  }, [user]);

  // Precision Presence Tracking
  useEffect(() => {
    if (!isSupabaseConfigured || !user?.id) return;
    
    const markOnline = () => {
      supabase.from('users').update({ is_online: true, last_seen: new Date().toISOString() }).eq('id', user.id).then();
    };
    markOnline();

    const heartbeat = setInterval(markOnline, 30000);

    const handlePresence = () => {
      supabase.from('users').update({ is_online: false, last_seen: new Date().toISOString() }).eq('id', user.id).then();
    };

    window.addEventListener('beforeunload', handlePresence);
    return () => {
      clearInterval(heartbeat);
      window.removeEventListener('beforeunload', handlePresence);
      handlePresence();
    };
  }, [user?.id]);

  const value = {
    user, authSession, users, authLoading, authError, isFirstRun,
    login, loginWithGoogle, verifyAdminCredentials, logout,
    addUser, toggleUserStatus, updateUser, deleteUser, resetPassword,
    cleanDuplicateUsers
  };

  if (!isSupabaseConfigured) {
    return <SupabaseSetupScreen />;
  }

  if (authLoading) {
    return <Preloader fullPage message="Connecting to 5G E-GURUCLINIC System..." />;
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
