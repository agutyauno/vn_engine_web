// ================================================================
// AUTH SERVICE (system_architecture.md 3.6, ADR-019, SECRETS.md)
// Quản lý Supabase Auth và Chế độ Khách (Guest / Offline Mode)
// ================================================================

import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

const GUEST_STORAGE_KEY = 'vn_guest_session';

export interface AuthState {
  isAuthenticated: boolean;
  isGuest: boolean;
  user: User | null;
  userLabel: string;
}

export class AuthService {
  private static instance: AuthService;
  private supabase: SupabaseClient | null = null;
  private currentUser: User | null = null;
  private isGuestActive: boolean = false;
  private listeners: ((state: AuthState) => void)[] = [];

  private constructor() {
    this.initSupabase();
    this.checkGuestSession();
  }

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  private initSupabase(): void {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseAnonKey && supabaseUrl !== '' && supabaseAnonKey !== '') {
      try {
        this.supabase = createClient(supabaseUrl, supabaseAnonKey);

        // Listen to Supabase auth state change
        this.supabase.auth.onAuthStateChange((_event, session) => {
          this.currentUser = session?.user || null;
          if (this.currentUser) {
            this.isGuestActive = false;
            localStorage.removeItem(GUEST_STORAGE_KEY);
          }
          this.notifyListeners();
        });

        // Check active session on startup
        this.supabase.auth.getSession().then(({ data: { session } }) => {
          if (session?.user) {
            this.currentUser = session.user;
            this.isGuestActive = false;
            localStorage.removeItem(GUEST_STORAGE_KEY);
            this.notifyListeners();
          }
        });
      } catch (err) {
        console.warn('[AuthService] Failed to initialize Supabase client:', err);
        this.supabase = null;
      }
    }
  }

  private checkGuestSession(): void {
    const stored = localStorage.getItem(GUEST_STORAGE_KEY);
    if (stored === 'true') {
      this.isGuestActive = true;
    }
  }

  public isConfigured(): boolean {
    return this.supabase !== null;
  }

  public getSupabaseClient(): SupabaseClient | null {
    return this.supabase;
  }

  public continueAsGuest(): void {
    this.isGuestActive = true;
    this.currentUser = null;
    localStorage.setItem(GUEST_STORAGE_KEY, 'true');
    this.notifyListeners();
  }

  public async signIn(
    email: string,
    password: string,
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.supabase) {
      return { success: false, error: 'Supabase cloud configuration not detected in .env' };
    }

    try {
      const { data, error } = await this.supabase.auth.signInWithPassword({ email, password });
      if (error) {
        return { success: false, error: error.message };
      }
      this.currentUser = data.user;
      this.isGuestActive = false;
      localStorage.removeItem(GUEST_STORAGE_KEY);
      this.notifyListeners();
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: (err as Error)?.message || 'Unknown authentication error' };
    }
  }

  public async signUp(
    email: string,
    password: string,
  ): Promise<{ success: boolean; error?: string; message?: string }> {
    if (!this.supabase) {
      return { success: false, error: 'Supabase cloud configuration not detected in .env' };
    }

    try {
      const { data, error } = await this.supabase.auth.signUp({ email, password });
      if (error) {
        return { success: false, error: error.message };
      }
      if (data.session) {
        this.currentUser = data.user;
        this.isGuestActive = false;
        localStorage.removeItem(GUEST_STORAGE_KEY);
        this.notifyListeners();
      } else {
        this.currentUser = null;
        this.isGuestActive = false;
      }
      return {
        success: true,
        message: data.session
          ? 'Account created and signed in successfully.'
          : 'Registration successful! Please check your email to confirm registration before signing in.',
      };
    } catch (err: unknown) {
      return { success: false, error: (err as Error)?.message || 'Unknown registration error' };
    }
  }

  public async signOut(): Promise<void> {
    if (this.supabase && this.currentUser) {
      try {
        await this.supabase.auth.signOut();
      } catch (err) {
        console.error('[AuthService] Error signing out from Supabase:', err);
      }
    }
    this.currentUser = null;
    this.isGuestActive = false;
    localStorage.removeItem(GUEST_STORAGE_KEY);
    this.notifyListeners();
  }

  public isAuthenticated(): boolean {
    return this.isGuestActive || this.currentUser !== null;
  }

  public isGuest(): boolean {
    return this.isGuestActive;
  }

  public getCurrentUserLabel(): string {
    if (this.currentUser?.email) {
      return this.currentUser.email;
    }
    if (this.isGuestActive) {
      return 'Guest Mode (Offline - Local Only)';
    }
    return 'Not Signed In';
  }

  public getUserId(): string {
    if (this.currentUser?.id) {
      return this.currentUser.id;
    }
    return 'local_guest';
  }

  public onAuthStateChange(listener: (state: AuthState) => void): () => void {
    this.listeners.push(listener);
    // Call immediately with current state
    listener(this.getState());
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  public getState(): AuthState {
    return {
      isAuthenticated: this.isAuthenticated(),
      isGuest: this.isGuest(),
      user: this.currentUser,
      userLabel: this.getCurrentUserLabel(),
    };
  }

  private notifyListeners(): void {
    const state = this.getState();
    this.listeners.forEach(fn => fn(state));
  }
}
