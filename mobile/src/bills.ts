import { groupPrompt } from "./groupExpense";
import { NATURES, type BillDraft, type ExpenseNature } from "./types";

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

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function normalizeDateInput(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (!match) return trimmed;
  return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

export function validateExpense(
  input: ExpenseInput,
): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const date = input.date?.trim() ?? "";
  if (!isIsoDate(date)) errors.push("Enter the bill date as YYYY-MM-DD.");

  const vendorName = input.vendorName.trim();
  if (!vendorName) errors.push("Enter the vendor.");
  else if (vendorName.length > 120) errors.push("Vendor name is too long.");

  if (input.billerName.trim().length > 120) errors.push("Billed-to name is too long.");

  if (input.amount == null || !Number.isFinite(input.amount) || input.amount <= 0) {
    errors.push("Enter an amount greater than zero.");
  }

  const currency = (input.currency || "INR").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) errors.push("Currency should be a 3-letter code.");

  if (!NATURES.includes(input.nature as ExpenseNature)) errors.push("Choose what kind of expense this is.");
  const nature = (NATURES.includes(input.nature as ExpenseNature) ? input.nature : "other") as ExpenseNature;

  let mealCount: number | null = null;
  if (nature === "food") {
    const meals = input.mealCount == null ? 1 : input.mealCount;
    if (!Number.isInteger(meals) || meals < 1 || meals > 20) errors.push("Meals should be between 1 and 20.");
    else mealCount = meals;
  }

  const groupMembers = input.groupMembers.map((name) => name.trim()).filter(Boolean);
  if (groupMembers.length > 12) errors.push("Add up to 12 people.");

  const amount = input.amount != null && Number.isFinite(input.amount) ? input.amount : null;
  const prompt = groupPrompt(nature, amount, mealCount, currency);
  if (prompt.ask && input.isGroup && groupMembers.length === 0) {
    errors.push(nature === "cab" ? "Add the people who shared this cab." : "Add the people who shared this meal.");
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true };
}

export function issuesForBill(bill: BillDraft): string[] {
  const amount = bill.amount.trim() === "" ? null : Number(bill.amount);
  const meals = bill.mealCount.trim() === "" ? null : Number(bill.mealCount);
  const result = validateExpense({
    date: normalizeDateInput(bill.date),
    vendorName: bill.vendorName,
    billerName: bill.billerName,
    amount: amount != null && Number.isFinite(amount) ? amount : null,
    currency: bill.currency,
    nature: bill.nature,
    mealCount: meals != null && Number.isFinite(meals) ? meals : null,
    isGroup: bill.isGroup,
    groupMembers: bill.groupMembers,
  });
  return result.ok ? [] : result.errors;
}

export function payloadForBill(bill: BillDraft) {
  const amount = bill.amount.trim() === "" ? null : Number(bill.amount);
  const meals = bill.mealCount.trim() === "" ? null : Number(bill.mealCount);
  return {
    id: bill.id,
    date: normalizeDateInput(bill.date),
    vendorName: bill.vendorName,
    billerName: bill.billerName,
    amount: amount != null && Number.isFinite(amount) ? amount : null,
    currency: bill.currency.trim().toUpperCase() || "INR",
    nature: bill.nature,
    mealCount: bill.nature === "food" && meals != null && Number.isFinite(meals) ? meals : null,
    isGroup: bill.isGroup,
    groupMembers: bill.isGroup ? bill.groupMembers : [],
  };
}
