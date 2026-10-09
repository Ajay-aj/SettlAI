import type { NextFunction, Request, Response } from "express";
import { config } from "./config";
import type { AuthUser } from "./types";

export type AuthedRequest = Request & { user: AuthUser };

type LookupResponse = {
  users?: Array<{ localId?: string; email?: string; displayName?: string }>;
  error?: { message?: string };
};

export async function verifyFirebaseToken(idToken: string): Promise<AuthUser> {
  if (!config.firebaseApiKey) {
    throw new Error("Firebase is not configured on the server.");
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${config.firebaseApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    },
  );
  const payload = (await response.json()) as LookupResponse;
  const user = payload.users?.[0];
  if (!response.ok || !user?.localId) {
    throw new Error(payload.error?.message ?? "Sign-in expired. Sign in again.");
  }
  const email = user.email ?? "";
  return {
    uid: user.localId,
    email,
    name: user.displayName?.trim() ?? "",
    role: email.toLowerCase() === config.adminEmail ? "admin" : "user",
  };
}

export async function requireUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.header("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }

  const token = match[1].trim();
  if (token === "demo") {
    if (!config.demoMode) {
      res.status(401).json({ error: "Demo mode is turned off." });
      return;
    }
    (req as AuthedRequest).user = {
      uid: "demo-user",
      email: "demo@reimburse.local",
      name: "",
      role: "user",
    };
    next();
    return;
  }

  if (token === "admin") {
    if (!config.demoMode) {
      res.status(401).json({ error: "Demo mode is turned off." });
      return;
    }
    (req as AuthedRequest).user = {
      uid: "admin-user",
      email: config.adminEmail,
      name: config.adminName,
      role: "admin",
    };
    next();
    return;
  }

  try {
    (req as AuthedRequest).user = await verifyFirebaseToken(token);
    next();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sign in to continue.";
    res.status(401).json({ error: message });
  }
}
