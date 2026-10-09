import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { onIdTokenChanged } from "firebase/auth";
import { getProfile, saveProfile, setTokenProvider } from "../api";
import { firebaseAuth, firebaseSignIn, firebaseSignOut, firebaseSignUp, friendlyAuthError } from "../firebase";

const DEMO_KEY = "reimburse.demo";

type Session = { email: string; mode: "demo" | "firebase" };

type AuthValue = {
  status: "loading" | "signedOut" | "needsProfile" | "signedIn";
  email: string;
  name: string;
  isAdmin: boolean;
  mode: "demo" | "firebase" | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  saveName: (name: string) => Promise<void>;
  signInDemo: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profileName, setProfileName] = useState<string | null | undefined>(undefined);
  const [isAdmin, setIsAdmin] = useState(false);
  const sessionRef = useRef<Session | null>(null);
  const profileEpoch = useRef(0);
  sessionRef.current = session ?? null;

  useEffect(() => {
    setTokenProvider(async () => {
      if (sessionRef.current?.mode === "demo") return "demo";
      const current = firebaseAuth()?.currentUser;
      return current ? current.getIdToken() : null;
    });
  }, []);

  useEffect(() => {
    let unsubscribe = () => {};
    let cancelled = false;

    void (async () => {
      const demo = await AsyncStorage.getItem(DEMO_KEY);
      if (cancelled) return;
      if (demo === "1") {
        setSession({ email: "demo@reimburse.local", mode: "demo" });
        return;
      }
      const auth = firebaseAuth();
      if (!auth) {
        setSession(null);
        return;
      }
      unsubscribe = onIdTokenChanged(auth, (user) => {
        if (!user) {
          setSession(null);
          return;
        }
        setSession({ email: user.email ?? "", mode: "firebase" });
      });
    })();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session) {
      setProfileName(undefined);
      setIsAdmin(false);
      return;
    }
    const epoch = ++profileEpoch.current;
    let cancelled = false;
    void getProfile()
      .then((profile) => {
        if (!cancelled && profileEpoch.current === epoch) {
          setProfileName(profile.name.trim());
          setIsAdmin(profile.role === "admin");
        }
      })
      .catch(() => {
        if (!cancelled && profileEpoch.current === epoch) {
          setProfileName("");
          setIsAdmin(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  const status: AuthValue["status"] =
    session === undefined || (session != null && profileName === undefined)
      ? "loading"
      : session == null
        ? "signedOut"
        : profileName
          ? "signedIn"
          : "needsProfile";

  const value = useMemo<AuthValue>(
    () => ({
      status,
      email: session?.email ?? "",
      name: profileName ?? "",
      isAdmin,
      mode: session?.mode ?? null,
      async signIn(email: string, password: string) {
        try {
          await AsyncStorage.removeItem(DEMO_KEY);
          await firebaseSignIn(email, password);
        } catch (error) {
          throw new Error(friendlyAuthError(error));
        }
      },
      async signUp(name: string, email: string, password: string) {
        const cleanName = name.trim().replace(/\s+/g, " ");
        if (cleanName.length < 2) throw new Error("Enter your name.");
        try {
          await AsyncStorage.removeItem(DEMO_KEY);
          await firebaseSignUp(cleanName, email, password);
          await saveProfile(cleanName);
          profileEpoch.current += 1;
          setProfileName(cleanName);
          setIsAdmin(false);
        } catch (error) {
          const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
          if (code.startsWith("auth/")) throw new Error(friendlyAuthError(error));
          throw error instanceof Error ? error : new Error("Couldn’t create the account.");
        }
      },
      async saveName(name: string) {
        const cleanName = name.trim().replace(/\s+/g, " ");
        if (cleanName.length < 2) throw new Error("Enter your name.");
        const profile = await saveProfile(cleanName);
        profileEpoch.current += 1;
        setProfileName(profile.name);
        setIsAdmin(profile.role === "admin");
      },
      async signInDemo() {
        await AsyncStorage.setItem(DEMO_KEY, "1");
        setSession({ email: "demo@reimburse.local", mode: "demo" });
      },
      async signOut() {
        await AsyncStorage.removeItem(DEMO_KEY);
        await firebaseSignOut();
        setSession(null);
      },
    }),
    [session, profileName, isAdmin, status],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("Auth is unavailable.");
  return value;
}
