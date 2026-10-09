import type { DisplayStatus, ExpenseStatus } from "./types";

export type ChatIntent =
  | { type: "expenses"; status: ExpenseStatus | "all" }
  | { type: "claims"; status: DisplayStatus | "all" | "awaiting" }
  | { type: "submit" }
  | { type: "help" };

function words(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[.!?]/g, "")
    .replace(/\s+/g, " ");
}

function claimStatus(text: string): DisplayStatus | "all" | "awaiting" | null {
  if (/part(?:ial|ly)?(?:\s|-)?paid|part paid/.test(text)) return "partially_paid";
  if (/\brejected\b|\breject/.test(text)) return "rejected";
  if (/\bpaid\b/.test(text)) return "paid";
  if (/\bapproved\b|\bapprovals?\b/.test(text) && !/\b(send|submit)\b/.test(text)) return "approved";
  if (/\bin review\b|\bunder review\b/.test(text)) return "submitted";
  if (/\bsubmitted\b|\bpending\b|\bwaiting\b/.test(text)) return "submitted";
  if (/\bdraft\b/.test(text)) return "draft";
  if (/\bowed\b|\boutstanding\b/.test(text)) return "awaiting";
  return null;
}

function expenseStatus(text: string): ExpenseStatus | "all" | null {
  if (/\breview\b|\bto check\b|\bunconfirmed\b/.test(text)) return "needs_review";
  if (/\bready\b|\bconfirmed\b|\bunclaimed\b/.test(text)) return "confirmed";
  if (/on a claim|\bclaimed\b/.test(text)) return "claimed";
  if (/\bbills?\b/.test(text)) return "all";
  return null;
}

export function parseChat(raw: string): ChatIntent {
  const text = words(raw);
  if (!text || /\bhelp\b|what can (?:you|i)/.test(text)) return { type: "help" };

  const asksToSubmit =
    /\b(send|submit)\b/.test(text) && /\b(approval|approve|claim|bills?)\b/.test(text);
  if (asksToSubmit || text === "send" || text === "submit") return { type: "submit" };

  const claims = claimStatus(text);
  if (claims) return { type: "claims", status: claims };
  if (/\bclaims?\b/.test(text)) return { type: "claims", status: "all" };

  const expenses = expenseStatus(text);
  if (expenses) return { type: "expenses", status: expenses };

  return { type: "help" };
}
