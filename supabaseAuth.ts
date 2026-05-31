import { supabase } from './supabaseClient';

export const auth = {
  currentUser: null as any
};

// Initialize currentUser synchronously if possible, but mostly rely on listener
supabase.auth.getSession().then(({ data: { session } }) => {
  if (session?.user) {
    auth.currentUser = {
      uid: session.user.id,
      email: session.user.email,
      displayName: session.user.user_metadata?.full_name || session.user.user_metadata?.name || '',
      photoURL: session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture || '',
    };
  }
});

supabase.auth.onAuthStateChange((event, session) => {
  if (session?.user) {
    auth.currentUser = {
      uid: session.user.id,
      email: session.user.email,
      displayName: session.user.user_metadata?.full_name || session.user.user_metadata?.name || '',
      photoURL: session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture || '',
    };
  } else {
    auth.currentUser = null;
  }
});

export const loginWithGoogle = async () => {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin
    }
  });
  if (error) console.error("Error signing in with Google", error);
};

export const logout = async () => {
  try {
    await supabase.auth.signOut();
  } catch (error) {
    console.error("Error signing out", error);
  }
};

export const onAuthStateChanged = (authObj: any, callback: (user: any) => void) => {
  supabase.auth.getSession().then(({ data: { session } }) => {
    callback(session?.user ? auth.currentUser : null);
  });
  
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    callback(session?.user ? auth.currentUser : null);
  });

  return () => subscription.unsubscribe();
};
