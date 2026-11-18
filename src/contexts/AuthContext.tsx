import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { deviceClockWrong } from "@/lib/clockSkew";
import { ClockWarning } from "@/components/ClockWarning";

type AuthCtx = {
  user: User | null;
  session: Session | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  schoolId: string | null;
  loading: boolean;
  refreshContext: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // A wrong device clock makes every new sign-in look expired, so the auth
  // client renews it in a loop until it is rate-limited and signs the user out.
  const [clockWrong, setClockWrong] = useState(false);
  const checkClock = useCallback((token: string | undefined) => {
    if (!deviceClockWrong(token)) return false;
    supabase.auth.stopAutoRefresh();
    setClockWrong(true);
    return true;
  }, []);

  const refreshFor = useCallback(async (uid: string | undefined) => {
    if (!uid) {
      setIsAdmin(false);
      setIsSuperAdmin(false);
      setSchoolId(null);
      return;
    }
    const [rolesRes, memRes] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", uid),
      supabase
        .from("school_members" as any)
        .select("school_id, role, is_primary")
        .eq("user_id", uid)
        .eq("is_primary", true)
        .maybeSingle(),
    ]);
    const roles = (rolesRes.data ?? []).map((r: any) => r.role);
    setIsAdmin(roles.includes("admin"));
    setIsSuperAdmin(roles.includes("super_admin"));
    setSchoolId(((memRes.data as any)?.school_id ?? null) as string | null);
  }, []);

  const refreshContext = useCallback(async () => {
    await refreshFor(user?.id);
  }, [refreshFor, user?.id]);

  const lastUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    let initialised = false;

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      const uid = newSession?.user?.id ?? null;
      // Only tokens the server has just issued are compared with the device clock.
      if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && checkClock(newSession?.access_token)) return;
      // Ignore events that don't change who is signed in (token refreshes fire
      // when the tab regains focus). Pushing a new session/user object or
      // flipping loading here would re-render or remount every page and wipe
      // in-memory UI state like selected filters.
      if (!initialised || uid === lastUserIdRef.current) return;
      lastUserIdRef.current = uid;
      setSession(newSession);
      setUser(newSession?.user ?? null);
      // The signed-in user actually changed: show loading while we refresh roles/school
      setLoading(true);
      refreshFor(uid ?? undefined).finally(() => setLoading(false));
    });

    supabase.auth.getSession().then(({ data: { session: existing } }) => {
      setSession(existing);
      setUser(existing?.user ?? null);
      lastUserIdRef.current = existing?.user?.id ?? null;
      refreshFor(existing?.user?.id).finally(() => {
        initialised = true;
        setLoading(false);
      });
    });

    return () => sub.subscription.unsubscribe();
  }, [refreshFor, checkClock]);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (!error) return checkClock(data.session?.access_token) ? { error: "Your computer's date and time are wrong. Correct them, then sign in again." } : {};
    if (/not confirmed/i.test(error.message)) return { error: "Please confirm your email first. Use the link we sent you, or resend it below." };
    if (/invalid login/i.test(error.message)) return { error: "Incorrect email or password." };
    return { error: error.message };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth?verified=1`,
        data: { full_name: fullName },
      },
    });
    if (error) return { error: error.message };
    // An existing address returns a user with no identities: don't create a duplicate.
    if (data.user && (data.user.identities?.length ?? 0) === 0) {
      return { error: "An account with this email already exists. Please sign in instead." };
    }
    return {};
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{ user, session, isAdmin, isSuperAdmin, schoolId, loading, refreshContext, signIn, signUp, signOut }}
    >
      {clockWrong ? <ClockWarning /> : children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
