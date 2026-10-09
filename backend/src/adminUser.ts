import { config } from "./config";
import { saveProfile } from "./db";

type IdentityPayload = {
  localId?: string;
  idToken?: string;
  error?: { message?: string };
};

async function identity(method: string, body: Record<string, unknown>): Promise<IdentityPayload> {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:${method}?key=${config.firebaseApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  return (await response.json()) as IdentityPayload;
}

export async function ensureAdminAccount(): Promise<void> {
  if (!config.firebaseApiKey) {
    console.log("Admin account was not created because FIREBASE_API_KEY is missing.");
    return;
  }

  let account = await identity("signUp", {
    email: config.adminEmail,
    password: config.adminPassword,
    returnSecureToken: true,
  });

  if (account.error?.message === "EMAIL_EXISTS") {
    account = await identity("signInWithPassword", {
      email: config.adminEmail,
      password: config.adminPassword,
      returnSecureToken: true,
    });
  }

  if (!account.localId) {
    const reason = account.error?.message ?? "unknown error";
    console.error(`Admin account could not be prepared (${reason}).`);
    return;
  }

  if (account.idToken) {
    await identity("update", {
      idToken: account.idToken,
      displayName: config.adminName,
      returnSecureToken: true,
    });
  }

  saveProfile(account.localId, config.adminEmail, config.adminName, new Date().toISOString(), "admin");
  console.log(`Admin account ready for ${config.adminEmail}`);
}
