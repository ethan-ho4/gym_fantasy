import { Session, User } from '@supabase/supabase-js';
import { create } from 'zustand';

import { supabase } from '@/lib/supabase';

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  initialized: boolean;
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string, displayName: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  loading: false,
  initialized: false,

  initialize: async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    set({ session, user: session?.user ?? null, initialized: true });

    supabase.auth.onAuthStateChange((_event, nextSession) => {
      set({ session: nextSession, user: nextSession?.user ?? null });
    });
  },

  signIn: async (email, password) => {
    set({ loading: true });
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    set({ loading: false });
    return error?.message ?? null;
  },

  signUp: async (email, password, displayName) => {
    set({ loading: true });

    const trimmedName = displayName.trim();
    const { data: available, error: availabilityError } = await supabase.rpc(
      'is_display_name_available',
      { p_name: trimmedName },
    );

    if (availabilityError) {
      set({ loading: false });
      return availabilityError.message;
    }
    if (available === false) {
      set({ loading: false });
      return 'That display name is already taken.';
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: trimmedName },
      },
    });
    set({ loading: false });

    if (error) return error.message;
    if (!data.user) return 'Sign up failed. Please try again.';
    if (!data.session) {
      return 'Check your email to confirm your account before signing in.';
    }
    return null;
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null });
  },
}));
