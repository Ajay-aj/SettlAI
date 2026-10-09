import { NATURES, type ExpenseNature } from "./types";

export type RawExtraction = {
  date: string | null;
  vendorName: string;
  billerName: string;
  amount: number | null;
  currency: string;
  nature: ExpenseNature;
  isGroupExpense: boolean;
  groupMemberNames: string[];
  mealCount: number | null;
  summary: string;
};

const PROMPT = `You read reimbursement bills, receipts, and invoices.
Return only JSON. Use null when a value is not printed. Never invent names, dates, or amounts.

date: the date printed on the bill, converted to YYYY-MM-DD. Indian bills are day-month-year, so 08/10/2026, 8-10-2026, and 8 Oct 2026 all mean 2026-10-08. If a date is visible, date must not be null.
vendorName: merchant, restaurant, hotel, airline, or cab company
billerName: person or company the bill is addressed to, or the guest/passenger name printed on it. Null if absent.
amount: total payable as a number, without currency symbols
currency: ISO 4217 code. Use INR when the bill shows ₹, Rs, or INR.
nature: food, cab, travel, lodging, or other
  food = meals, restaurants, cafes, food delivery
  cab = taxi, ride-hail, auto-rickshaw, cab
  travel = flight, train, bus, or fuel. Not a taxi.
  lodging = hotel or other stay
  other = anything else
isGroupExpense: true only when the document shows more than one person sharing the expense
groupMemberNames: names printed for the people who shared it, otherwise []
mealCount: for food, how many meals the total covers if stated, otherwise 1. Null when nature is not food.
summary: one short line describing the bill`;

export function extractionPrompt(): string {
  return PROMPT;
}

export function parseModelJson(text: string): unknown {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return JSON.parse(trimmed);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value * 100) / 100;
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/₹/g, "").replace(/rs\.?/gi, "").replace(/,/g, "").trim();
    const amount = Number(cleaned);
    if (Number.isFinite(amount)) return Math.round(amount * 100) / 100;
  }
  return null;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function asBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return false;
}

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function isoDate(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (year < 100) year += 2000;
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseBillDate(value: string): string | null {
  const text = value.trim().replace(/,/g, "").replace(/\s+/g, " ");
  if (!text) return null;

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return isoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const yearFirst = text.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if (yearFirst) return isoDate(Number(yearFirst[1]), Number(yearFirst[2]), Number(yearFirst[3]));

  const numeric = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (numeric) {
    const first = Number(numeric[1]);
    const second = Number(numeric[2]);
    const year = Number(numeric[3]);
    const day = second > 12 ? second : first;
    const month = second > 12 ? first : second;
    return isoDate(year, month, day);
  }

  const dayMonth = text.match(/^(\d{1,2})(?:st|nd|rd|th)?[\/\-.\s]+([A-Za-z]+)[\/\-.\s]+(\d{2,4})$/);
  if (dayMonth) {
    const month = MONTHS[dayMonth[2].toLowerCase()];
    if (month) return isoDate(Number(dayMonth[3]), month, Number(dayMonth[1]));
  }

  const monthDay = text.match(/^([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\d{2,4})$/);
  if (monthDay) {
    const month = MONTHS[monthDay[1].toLowerCase()];
    if (month) return isoDate(Number(monthDay[3]), month, Number(monthDay[2]));
  }

  return null;
}

function firstText(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const text = asText(record[key]);
    if (text) return text;
  }
  return "";
}

function asNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const names: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const name = item.trim().replace(/\s+/g, " ");
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name.slice(0, 60));
  }
  return names.slice(0, 12);
}

export function normalizeExtraction(input: unknown): RawExtraction {
  const record = asRecord(input);
  const natureValue = asText(record.nature).toLowerCase();
  const nature: ExpenseNature = NATURES.includes(natureValue as ExpenseNature)
    ? (natureValue as ExpenseNature)
    : "other";

  const date = parseBillDate(firstText(record, ["date", "billDate", "invoiceDate"]));

  const currencyText = asText(record.currency).toUpperCase();
  const currency = /^[A-Z]{3}$/.test(currencyText) ? currencyText : "INR";

  let mealCount: number | null = null;
  if (nature === "food") {
    const rawMeals = record.mealCount;
    const meals =
      typeof rawMeals === "number"
        ? rawMeals
        : typeof rawMeals === "string"
          ? Number(rawMeals)
          : 1;
    mealCount = Number.isInteger(meals) && meals >= 1 && meals <= 20 ? meals : 1;
  }

  return {
    date,
    vendorName: asText(record.vendorName).slice(0, 120),
    billerName: firstText(record, ["billerName", "billedTo", "guestName"]).slice(0, 120),
    amount: asAmount(record.amount),
    currency,
    nature,
    isGroupExpense: asBoolean(record.isGroupExpense),
    groupMemberNames: asNames(record.groupMemberNames),
    mealCount,
    summary: asText(record.summary).slice(0, 240),
  };
}

export function emptyExtraction(summary = ""): RawExtraction {
  return {
    date: null,
    vendorName: "",
    billerName: "",
    amount: null,
    currency: "INR",
    nature: "other",
    isGroupExpense: false,
    groupMemberNames: [],
    mealCount: null,
    summary,
  };
}
