import { Platform } from "react-native";
import { API_URL } from "./config";
import type { Claim, Expense, Payment, Summary } from "./types";

export type LocalFile = {
  uri: string;
  name: string;
  mimeType: string;
};

export class ApiError extends Error {
  status: number;
  issues: { id: string; errors: string[] }[];

  constructor(message: string, status: number, issues: { id: string; errors: string[] }[] = []) {
    super(message);
    this.status = status;
    this.issues = issues;
  }
}

let tokenProvider: () => Promise<string | null> = async () => null;

export function setTokenProvider(provider: () => Promise<string | null>): void {
  tokenProvider = provider;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = await tokenProvider();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError("Can’t reach the server. Start the API and check the app’s API address.", 0);
  }

  const text = await response.text();
  let body: Record<string, unknown> = {};
  if (text) {
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      body = { text };
    }
  }
  if (!response.ok) {
    const issues = Array.isArray(body.issues)
      ? (body.issues as { id: string; errors: string[] }[])
      : [];
    throw new ApiError(typeof body.error === "string" ? body.error : "Request failed.", response.status, issues);
  }
  return body as T;
}

export async function health(): Promise<{ ok: boolean; demoMode: boolean; extraction: boolean }> {
  return request("/api/health");
}

export async function extractBills(files: LocalFile[]): Promise<Expense[]> {
  const body = new FormData();
  for (const file of files) {
    if (Platform.OS === "web") {
      const response = await fetch(file.uri);
      const blob = await response.blob();
      body.append("files", blob, file.name);
    } else {
      body.append("files", {
        uri: file.uri,
        name: file.name,
        type: file.mimeType,
      } as unknown as Blob);
    }
  }
  const result = await request<{ expenses: Expense[] }>("/api/bills/extract", { method: "POST", body });
  return result.expenses;
}

export async function listExpenses(status?: Expense["status"]): Promise<Expense[]> {
  const query = status ? `?status=${status}` : "";
  const result = await request<{ expenses: Expense[] }>(`/api/expenses${query}`);
  return result.expenses;
}

export async function getExpense(id: string): Promise<Expense> {
  const result = await request<{ expense: Expense }>(`/api/expenses/${id}`);
  return result.expense;
}

export async function confirmExpenses(expenses: unknown[]): Promise<Expense[]> {
  const result = await request<{ expenses: Expense[] }>("/api/expenses/confirm", {
    method: "POST",
    body: JSON.stringify({ expenses }),
  });
  return result.expenses;
}

export async function deleteExpense(id: string): Promise<void> {
  await request(`/api/expenses/${id}`, { method: "DELETE" });
}

export async function summary(): Promise<Summary> {
  return request<Summary>("/api/summary");
}

export async function listClaims(): Promise<Claim[]> {
  const result = await request<{ claims: Claim[] }>("/api/claims");
  return result.claims;
}

export async function createClaim(expenseIds: string[]): Promise<Claim> {
  const result = await request<{ claim: Claim }>("/api/claims", {
    method: "POST",
    body: JSON.stringify({ expenseIds }),
  });
  return result.claim;
}

export async function getClaim(id: string): Promise<{ claim: Claim; expenses: Expense[]; payments: Payment[] }> {
  return request(`/api/claims/${id}`);
}

export async function claimText(id: string): Promise<string> {
  const headers = new Headers();
  const token = await tokenProvider();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_URL}/api/claims/${id}/text`, { headers });
  if (!response.ok) throw new ApiError("Could not prepare the claim.", response.status);
  return response.text();
}

export async function renameClaim(id: string, title: string): Promise<Claim> {
  const result = await request<{ claim: Claim }>(`/api/claims/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
  return result.claim;
}

export async function submitClaim(id: string): Promise<Claim> {
  const result = await request<{ claim: Claim }>(`/api/claims/${id}/submit`, { method: "POST" });
  return result.claim;
}

export async function setClaimStatus(id: string, status: "approved" | "rejected" | "draft"): Promise<Claim> {
  const result = await request<{ claim: Claim }>(`/api/claims/${id}/status`, {
    method: "POST",
    body: JSON.stringify({ status }),
  });
  return result.claim;
}

export async function logPayment(
  id: string,
  payment: { amount: number; paidOn: string; reference: string },
): Promise<{ claim: Claim; payments: Payment[] }> {
  return request(`/api/claims/${id}/payments`, {
    method: "POST",
    body: JSON.stringify(payment),
  });
}

export type Profile = { name: string; email: string; role: "user" | "admin" };

export async function getProfile(): Promise<Profile> {
  const result = await request<{ profile: Profile }>("/api/me");
  return result.profile;
}

export async function saveProfile(name: string): Promise<Profile> {
  const result = await request<{ profile: Profile }>("/api/me", {
    method: "PUT",
    body: JSON.stringify({ name }),
  });
  return result.profile;
}
