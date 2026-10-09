import type { ExpenseNature } from "./types";
import { NATURES } from "./types";
import { groupPrompt } from "./groupExpense";

export type ExpenseInput = {
  date: string | null;
  vendorName: string;
  billerName: string;
  amount: number | null;
  currency: string;
  nature: string;
  mealCount: number | null;
  isGroup: boolean;
  groupMembers: string[];
};

export type ValidExpense = {
  date: string;
  vendorName: string;
  billerName: string;
  amount: number;
  currency: string;
  nature: ExpenseNature;
  mealCount: number | null;
  isGroup: boolean;
  groupMembers: string[];
};

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function parseExpenseInput(input: unknown): ExpenseInput | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  return {
    date: typeof record.date === "string" ? record.date : null,
    vendorName: typeof record.vendorName === "string" ? record.vendorName : "",
    billerName: typeof record.billerName === "string" ? record.billerName : "",
    amount: asNumber(record.amount),
    currency: typeof record.currency === "string" ? record.currency : "INR",
    nature: typeof record.nature === "string" ? record.nature : "",
    mealCount: asNumber(record.mealCount),
    isGroup: record.isGroup === true,
    groupMembers: Array.isArray(record.groupMembers)
      ? record.groupMembers.filter((name): name is string => typeof name === "string")
      : [],
  };
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function validateExpense(
  input: ExpenseInput,
): { ok: true; value: ValidExpense } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  const date = input.date?.trim() ?? "";
  if (!isIsoDate(date)) errors.push("Enter the bill date as YYYY-MM-DD.");

  const vendorName = input.vendorName.trim().replace(/\s+/g, " ");
  if (!vendorName) errors.push("Enter the vendor.");
  else if (vendorName.length > 120) errors.push("Vendor name is too long.");

  const billerName = input.billerName.trim().replace(/\s+/g, " ");
  if (billerName.length > 120) errors.push("Billed-to name is too long.");

  if (input.amount == null || !Number.isFinite(input.amount) || input.amount <= 0) {
    errors.push("Enter an amount greater than zero.");
  } else if (input.amount > 10_000_000) {
    errors.push("Amount is too large.");
  }

  const currency = (input.currency || "INR").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) errors.push("Currency should be a 3-letter code.");

  if (!NATURES.includes(input.nature as ExpenseNature)) {
    errors.push("Choose what kind of expense this is.");
  }
  const nature = (
    NATURES.includes(input.nature as ExpenseNature) ? input.nature : "other"
  ) as ExpenseNature;

  let mealCount: number | null = null;
  if (nature === "food") {
    const meals = input.mealCount == null ? 1 : input.mealCount;
    if (!Number.isInteger(meals) || meals < 1 || meals > 20) {
      errors.push("Meals should be between 1 and 20.");
    } else {
      mealCount = meals;
    }
  }

  const seen = new Set<string>();
  const groupMembers: string[] = [];
  for (const name of input.groupMembers) {
    const clean = name.trim().replace(/\s+/g, " ");
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (clean.length > 60) {
      errors.push("Each name should be 60 characters or fewer.");
      continue;
    }
    groupMembers.push(clean);
  }
  if (groupMembers.length > 12) errors.push("Add up to 12 people.");

  const amount =
    input.amount != null && Number.isFinite(input.amount)
      ? Math.round(input.amount * 100) / 100
      : null;
  const prompt = groupPrompt(nature, amount, mealCount, currency);
  const isGroup = input.isGroup;
  if (prompt.ask && isGroup && groupMembers.length === 0) {
    errors.push(
      nature === "cab"
        ? "Add the people who shared this cab."
        : "Add the people who shared this meal.",
    );
  }

  if (errors.length > 0 || amount == null) return { ok: false, errors };

  return {
    ok: true,
    value: {
      date,
      vendorName,
      billerName,
      amount,
      currency,
      nature,
      mealCount,
      isGroup,
      groupMembers: isGroup ? groupMembers : [],
    },
  };
}
