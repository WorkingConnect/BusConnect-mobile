import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { registerForPushNotifications, unregisterCurrentPushToken } from "./push-notifications";

interface AuthContextValue {
  session: Session | null;
  /** Undetermined-yet vs. genuinely signed-out — lets screens show a
   *  loading state instead of flashing a "sign in" prompt on launch. */
  loading: boolean;
  /** True for a brief window around sign-out/account-deletion — lets a
   *  single global overlay (see SplashTransition in the root layout) cover
   *  the redirect to /login, instead of each screen racing its own
   *  timeout against the tabs layout's immediate auth-gate redirect. */
  signingOut: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const pushRegisteredForUser = useRef<string | null>(null);

  useEffect(() => {
    // No .catch() here used to leave `loading` stuck true forever on any
    // rejection (e.g. a SecureStore/Keychain read failure) — invisible
    // before, since no signed-out screen depended on `loading` resolving
    // until guest browsing was allowed past the tab layout's auth gate.
    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      .catch(() => setSession(null))
      .finally(() => setLoading(false));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Register the device's push token once per signed-in user — not on every
  // token refresh (onAuthStateChange fires repeatedly for the same user).
  useEffect(() => {
    if (!session || pushRegisteredForUser.current === session.user.id) return;
    pushRegisteredForUser.current = session.user.id;
    void registerForPushNotifications(session.access_token);
  }, [session]);

  async function signOut() {
    setSigningOut(true);
    if (session) await unregisterCurrentPushToken(session.access_token);
    pushRegisteredForUser.current = null;
    await supabase.auth.signOut();
    // Hold the overlay a beat after the auth state flips so the redirect to
    // /login resolves underneath it, instead of appearing as an abrupt cut.
    await new Promise((resolve) => setTimeout(resolve, 550));
    setSigningOut(false);
  }

  return (
    <AuthContext.Provider value={{ session, loading, signingOut, signOut }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
