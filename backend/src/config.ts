import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

function directory(envName: string, fallback: string): string {
  const value = process.env[envName]?.trim();
  return value ? path.resolve(value) : path.resolve(process.cwd(), fallback);
}

function flag(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value.trim() === "") return fallback;
  return value === "1" || value.toLowerCase() === "true";
}

export const config = {
  port: Number(process.env.PORT ?? 8787),
  demoMode: flag(process.env.DEMO_MODE, true),
  firebaseApiKey: process.env.FIREBASE_API_KEY?.trim() ?? "",
  geminiApiKey: process.env.GEMINI_API_KEY?.trim() ?? "",
  geminiModel: process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash",
  adminEmail: (process.env.ADMIN_EMAIL?.trim() || "admin@reimburse.app").toLowerCase(),
  adminPassword: process.env.ADMIN_PASSWORD?.trim() || "ReimburseAdmin1",
  adminName: "Admin",
  dataDir: directory("DATA_DIR", "data"),
  uploadsDir: directory("UPLOADS_DIR", "uploads"),
};

export const FOOD_PER_MEAL_LIMIT = 250;
export const MAX_BILLS_PER_UPLOAD = 10;
export const MAX_FILE_BYTES = 8 * 1024 * 1024;
