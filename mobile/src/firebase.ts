import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  initializeAuth,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type Auth,
  type Persistence,
} from "firebase/auth";
import { firebaseConfig, isFirebaseConfigured } from "./config";

let auth: Auth | null = null;

function nativePersistence(): Persistence {
  const authModule = require("firebase/auth") as {
    getReactNativePersistence?: (storage: typeof AsyncStorage) => Persistence;
  };
  if (!authModule.getReactNativePersistence) {
    throw new Error("Native auth persistence is unavailable.");
  }
  return authModule.getReactNativePersistence(AsyncStorage);
}

export function firebaseAuth(): Auth | null {
  if (!isFirebaseConfigured()) return null;
  if (auth) return auth;
  const app: FirebaseApp = getApps()[0] ?? initializeApp(firebaseConfig);
  try {
    auth =
      Platform.OS === "web"
        ? initializeAuth(app, { persistence: browserLocalPersistence })
        : initializeAuth(app, { persistence: nativePersistence() });
  } catch {
    auth = getAuth(getApp());
  }
  return auth;
}

const MESSAGES: Record<string, string> = {
  "auth/invalid-email": "Enter a valid email address.",
  "auth/email-already-in-use": "An account with this email already exists.",
  "auth/invalid-credential": "Email or password doesn’t match.",
  "auth/wrong-password": "Email or password doesn’t match.",
  "auth/user-not-found": "Email or password doesn’t match.",
  "auth/weak-password": "Use at least 6 characters.",
  "auth/too-many-requests": "Too many attempts. Wait a moment and try again.",
  "auth/network-request-failed": "Can’t reach Firebase. Check your connection.",
};

export function friendlyAuthError(error: unknown): string {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  return MESSAGES[code] ?? "Couldn’t sign in. Check the details and try again.";
}

export async function firebaseSignIn(email: string, password: string): Promise<void> {
  const auth = firebaseAuth();
  if (!auth) throw new Error("Add the Firebase keys before signing in.");
  await signInWithEmailAndPassword(auth, email.trim(), password);
}

export async function firebaseSignUp(name: string, email: string, password: string): Promise<void> {
  const auth = firebaseAuth();
  if (!auth) throw new Error("Add the Firebase keys before creating an account.");
  const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
  await updateProfile(credential.user, { displayName: name.trim() });
}

export async function firebaseSignOut(): Promise<void> {
  const auth = firebaseAuth();
  if (auth) await signOut(auth);
}
