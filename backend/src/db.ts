import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { outstandingAmount, displayStatus } from "./claimStatus";
import { config } from "./config";
import type {
  Claim,
  Expense,
  ExpenseNature,
  ExpenseStatus,
  Payment,
  StoredClaimStatus,
} from "./types";

let database: DatabaseSync | null = null;

export function uploadsRoot(): string {
  return config.uploadsDir;
}

export function openDatabase(): DatabaseSync {
  if (database) return database;
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.mkdirSync(uploadsRoot(), { recursive: true });
  database = new DatabaseSync(path.join(config.dataDir, "reimburse.db"));
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      date TEXT,
      vendor_name TEXT NOT NULL DEFAULT '',
      biller_name TEXT NOT NULL DEFAULT '',
      amount REAL,
      currency TEXT NOT NULL DEFAULT 'INR',
      nature TEXT NOT NULL,
      meal_count INTEGER,
      is_group INTEGER NOT NULL DEFAULT 0,
      group_members TEXT NOT NULL DEFAULT '[]',
      ai_suggested_group INTEGER NOT NULL DEFAULT 0,
      summary TEXT NOT NULL DEFAULT '',
      extract_error TEXT,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_path TEXT NOT NULL,
      status TEXT NOT NULL,
      claim_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS claims (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      submitter_email TEXT NOT NULL,
      created_at TEXT NOT NULL,
      submitted_at TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      claim_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      amount REAL NOT NULL,
      paid_on TEXT NOT NULL,
      reference TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_expenses_user ON expenses(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_claims_user ON claims(user_id);
    CREATE INDEX IF NOT EXISTS idx_payments_claim ON payments(claim_id);
    CREATE TABLE IF NOT EXISTS profiles (
      user_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      updated_at TEXT NOT NULL
    );
  `);
  const columns = database.prepare("PRAGMA table_info(profiles)").all() as { name: string }[];
  if (!columns.some((column) => column.name === "role")) {
    database.exec("ALTER TABLE profiles ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
  }
  return database;
}

export type Profile = { name: string; email: string; role: "user" | "admin" };

export function getProfile(userId: string): Profile | undefined {
  const row = db()
    .prepare("SELECT name, email, role FROM profiles WHERE user_id = ?")
    .get(userId) as { name: string; email: string; role: string } | undefined;
  if (!row) return undefined;
  return { name: row.name, email: row.email, role: row.role === "admin" ? "admin" : "user" };
}

export function saveProfile(
  userId: string,
  email: string,
  name: string,
  now: string,
  role: "user" | "admin" = "user",
): void {
  const existing = getProfile(userId);
  const nextRole = role === "admin" || existing?.role === "admin" ? "admin" : "user";
  db()
    .prepare(
      `INSERT INTO profiles (user_id, name, email, role, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         name = excluded.name,
         email = excluded.email,
         role = excluded.role,
         updated_at = excluded.updated_at`,
    )
    .run(userId, name, email, nextRole, now);
}

function db(): DatabaseSync {
  return openDatabase();
}

export function transaction<T>(fn: () => T): T {
  const connection = db();
  connection.exec("BEGIN");
  try {
    const result = fn();
    connection.exec("COMMIT");
    return result;
  } catch (error) {
    connection.exec("ROLLBACK");
    throw error;
  }
}

type ExpenseRow = {
  id: string;
  user_id: string;
  date: string | null;
  vendor_name: string;
  biller_name: string;
  amount: number | null;
  currency: string;
  nature: string;
  meal_count: number | null;
  is_group: number;
  group_members: string;
  ai_suggested_group: number;
  summary: string;
  extract_error: string | null;
  file_name: string;
  mime_type: string;
  file_path: string;
  status: string;
  claim_id: string | null;
  created_at: string;
  updated_at: string;
};

function mapExpense(row: ExpenseRow): Expense {
  let groupMembers: string[] = [];
  try {
    const parsed = JSON.parse(row.group_members) as unknown;
    if (Array.isArray(parsed)) {
      groupMembers = parsed.filter((name): name is string => typeof name === "string");
    }
  } catch {
    groupMembers = [];
  }

  return {
    id: row.id,
    userId: row.user_id,
    date: row.date,
    vendorName: row.vendor_name,
    billerName: row.biller_name,
    amount: row.amount,
    currency: row.currency,
    nature: row.nature as ExpenseNature,
    mealCount: row.meal_count,
    isGroup: row.is_group === 1,
    groupMembers,
    aiSuggestedGroup: row.ai_suggested_group === 1,
    summary: row.summary,
    extractError: row.extract_error,
    fileName: row.file_name,
    mimeType: row.mime_type,
    filePath: row.file_path,
    status: row.status as ExpenseStatus,
    claimId: row.claim_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type NewExpense = {
  id: string;
  userId: string;
  date: string | null;
  vendorName: string;
  billerName: string;
  amount: number | null;
  currency: string;
  nature: ExpenseNature;
  mealCount: number | null;
  isGroup: boolean;
  groupMembers: string[];
  aiSuggestedGroup: boolean;
  summary: string;
  extractError: string | null;
  fileName: string;
  mimeType: string;
  filePath: string;
  status: ExpenseStatus;
};

export function insertExpense(expense: NewExpense, now: string): Expense {
  db()
    .prepare(
      `INSERT INTO expenses (
        id, user_id, date, vendor_name, biller_name, amount, currency, nature, meal_count,
        is_group, group_members, ai_suggested_group, summary, extract_error, file_name,
        mime_type, file_path, status, claim_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    )
    .run(
      expense.id,
      expense.userId,
      expense.date,
      expense.vendorName,
      expense.billerName,
      expense.amount,
      expense.currency,
      expense.nature,
      expense.mealCount,
      expense.isGroup ? 1 : 0,
      JSON.stringify(expense.groupMembers),
      expense.aiSuggestedGroup ? 1 : 0,
      expense.summary,
      expense.extractError,
      expense.fileName,
      expense.mimeType,
      expense.filePath,
      expense.status,
      now,
      now,
    );
  return getExpense(expense.userId, expense.id)!;
}

export type ExpenseUpdate = {
  date: string | null;
  vendorName: string;
  billerName: string;
  amount: number | null;
  currency: string;
  nature: ExpenseNature;
  mealCount: number | null;
  isGroup: boolean;
  groupMembers: string[];
  status?: ExpenseStatus;
  claimId?: string | null;
};

export function updateExpense(
  userId: string,
  id: string,
  update: ExpenseUpdate,
  now: string,
): void {
  db()
    .prepare(
      `UPDATE expenses SET
        date = ?, vendor_name = ?, biller_name = ?, amount = ?, currency = ?, nature = ?,
        meal_count = ?, is_group = ?, group_members = ?, status = COALESCE(?, status),
        claim_id = ?, updated_at = ?
      WHERE id = ? AND user_id = ?`,
    )
    .run(
      update.date,
      update.vendorName,
      update.billerName,
      update.amount,
      update.currency,
      update.nature,
      update.mealCount,
      update.isGroup ? 1 : 0,
      JSON.stringify(update.groupMembers),
      update.status ?? null,
      update.claimId === undefined ? getExpense(userId, id)?.claimId ?? null : update.claimId,
      now,
      id,
      userId,
    );
}

export function getExpense(userId: string, id: string): Expense | undefined {
  const row = db()
    .prepare("SELECT * FROM expenses WHERE id = ? AND user_id = ?")
    .get(id, userId) as ExpenseRow | undefined;
  return row ? mapExpense(row) : undefined;
}

export function listExpenses(userId: string, status?: ExpenseStatus): Expense[] {
  const rows = status
    ? (db()
        .prepare(
          "SELECT * FROM expenses WHERE user_id = ? AND status = ? ORDER BY created_at DESC",
        )
        .all(userId, status) as ExpenseRow[])
    : (db()
        .prepare("SELECT * FROM expenses WHERE user_id = ? ORDER BY created_at DESC")
        .all(userId) as ExpenseRow[]);
  return rows.map(mapExpense);
}

export function deleteExpense(userId: string, id: string): Expense | undefined {
  const existing = getExpense(userId, id);
  if (!existing) return undefined;
  db().prepare("DELETE FROM expenses WHERE id = ? AND user_id = ?").run(id, userId);
  return existing;
}

type ClaimRow = {
  id: string;
  user_id: string;
  title: string;
  status: string;
  submitter_email: string;
  created_at: string;
  submitted_at: string | null;
  updated_at: string;
};

function mapClaim(row: ClaimRow): Claim {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    status: row.status as StoredClaimStatus,
    submitterEmail: row.submitter_email,
    createdAt: row.created_at,
    submittedAt: row.submitted_at,
    updatedAt: row.updated_at,
  };
}

export function insertClaim(claim: Claim): void {
  db()
    .prepare(
      `INSERT INTO claims (
        id, user_id, title, status, submitter_email, created_at, submitted_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      claim.id,
      claim.userId,
      claim.title,
      claim.status,
      claim.submitterEmail,
      claim.createdAt,
      claim.submittedAt,
      claim.updatedAt,
    );
}

export function getClaim(userId: string, id: string): Claim | undefined {
  const row = db()
    .prepare("SELECT * FROM claims WHERE id = ? AND user_id = ?")
    .get(id, userId) as ClaimRow | undefined;
  return row ? mapClaim(row) : undefined;
}

export function getClaimById(id: string): Claim | undefined {
  const row = db().prepare("SELECT * FROM claims WHERE id = ?").get(id) as ClaimRow | undefined;
  return row ? mapClaim(row) : undefined;
}

export function listClaims(userId: string): Claim[] {
  const rows = db()
    .prepare("SELECT * FROM claims WHERE user_id = ? ORDER BY created_at DESC")
    .all(userId) as ClaimRow[];
  return rows.map(mapClaim);
}

export function listClaimsForAdmin(adminUserId: string): Claim[] {
  const rows = db()
    .prepare(
      `SELECT * FROM claims
       WHERE status != 'draft' OR user_id = ?
       ORDER BY updated_at DESC`,
    )
    .all(adminUserId) as ClaimRow[];
  return rows.map(mapClaim);
}

export function updateClaim(
  userId: string,
  id: string,
  update: { title?: string; status?: StoredClaimStatus; submittedAt?: string | null },
  now: string,
): void {
  const current = getClaim(userId, id);
  if (!current) return;
  db()
    .prepare(
      `UPDATE claims SET title = ?, status = ?, submitted_at = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    )
    .run(
      update.title ?? current.title,
      update.status ?? current.status,
      update.submittedAt === undefined ? current.submittedAt : update.submittedAt,
      now,
      id,
      userId,
    );
}

export function attachExpensesToClaim(
  userId: string,
  claimId: string,
  expenseIds: string[],
  now: string,
): void {
  const statement = db().prepare(
    `UPDATE expenses SET status = 'claimed', claim_id = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`,
  );
  for (const expenseId of expenseIds) {
    statement.run(claimId, now, expenseId, userId);
  }
}

export function listClaimExpenses(userId: string, claimId: string): Expense[] {
  const rows = db()
    .prepare(
      "SELECT * FROM expenses WHERE user_id = ? AND claim_id = ? ORDER BY date ASC, created_at ASC",
    )
    .all(userId, claimId) as ExpenseRow[];
  return rows.map(mapExpense);
}

type PaymentRow = {
  id: string;
  claim_id: string;
  user_id: string;
  amount: number;
  paid_on: string;
  reference: string;
  note: string;
  created_at: string;
};

function mapPayment(row: PaymentRow): Payment {
  return {
    id: row.id,
    claimId: row.claim_id,
    userId: row.user_id,
    amount: row.amount,
    paidOn: row.paid_on,
    reference: row.reference,
    note: row.note,
    createdAt: row.created_at,
  };
}

export function insertPayment(payment: Payment): void {
  db()
    .prepare(
      `INSERT INTO payments (
        id, claim_id, user_id, amount, paid_on, reference, note, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      payment.id,
      payment.claimId,
      payment.userId,
      payment.amount,
      payment.paidOn,
      payment.reference,
      payment.note,
      payment.createdAt,
    );
}

export function listPayments(userId: string, claimId?: string): Payment[] {
  const rows = claimId
    ? (db()
        .prepare(
          "SELECT * FROM payments WHERE user_id = ? AND claim_id = ? ORDER BY paid_on ASC, created_at ASC",
        )
        .all(userId, claimId) as PaymentRow[])
    : (db()
        .prepare("SELECT * FROM payments WHERE user_id = ? ORDER BY paid_on DESC")
        .all(userId) as PaymentRow[]);
  return rows.map(mapPayment);
}

export function expenseTotal(expenses: Expense[]): number {
  return Math.round(expenses.reduce((sum, expense) => sum + (expense.amount ?? 0), 0) * 100) / 100;
}

export function paymentTotal(payments: Payment[]): number {
  return Math.round(payments.reduce((sum, payment) => sum + payment.amount, 0) * 100) / 100;
}

export type ClaimView = Claim & {
  total: number;
  paid: number;
  outstanding: number;
  expenseCount: number;
  displayStatus: ReturnType<typeof displayStatus>;
};

export function viewClaim(userId: string, claim: Claim): ClaimView {
  const expenses = listClaimExpenses(userId, claim.id);
  const payments = listPayments(userId, claim.id);
  const total = expenseTotal(expenses);
  const paid = paymentTotal(payments);
  return {
    ...claim,
    total,
    paid,
    outstanding: outstandingAmount(total, paid),
    expenseCount: expenses.length,
    displayStatus: displayStatus(claim.status, total, paid),
  };
}
