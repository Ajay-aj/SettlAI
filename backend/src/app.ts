import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { requireUser, type AuthedRequest } from "./auth";
import { renderClaimText } from "./claimText";
import { config, MAX_BILLS_PER_UPLOAD, MAX_FILE_BYTES } from "./config";
import {
  attachExpensesToClaim,
  deleteExpense,
  expenseTotal,
  getClaim,
  getClaimById,
  getExpense,
  getProfile,
  insertClaim,
  insertExpense,
  insertPayment,
  listClaimExpenses,
  listClaims,
  listClaimsForAdmin,
  listExpenses,
  listPayments,
  paymentTotal,
  saveProfile,
  transaction,
  updateClaim,
  updateExpense,
  uploadsRoot,
  viewClaim,
  type ExpenseUpdate,
} from "./db";
import { readBill } from "./extract";
import { formatLongDate } from "./format";
import { groupPrompt, initialIsGroup } from "./groupExpense";
import type { AuthUser, Claim, Expense, StoredClaimStatus } from "./types";
import { isIsoDate, parseExpenseInput, validateExpense } from "./validateExpense";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: MAX_BILLS_PER_UPLOAD },
});

function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): express.RequestHandler {
  return (req, res, next) => {
    void handler(req, res, next).catch(next);
  };
}

function userOf(req: Request): AuthedRequest["user"] {
  return (req as AuthedRequest).user;
}

function profileOf(user: AuthUser) {
  const stored = getProfile(user.uid);
  return {
    name: stored?.name || user.name,
    email: stored?.email || user.email,
    role: user.role,
  };
}

function claimFor(user: AuthUser, id: string): Claim | undefined {
  return user.role === "admin" ? getClaimById(id) : getClaim(user.uid, id);
}

function blocksFiling(user: AuthUser, res: Response): boolean {
  if (user.role !== "admin") return false;
  res.status(403).json({ error: "An admin approves claims and logs payments." });
  return true;
}

export function publicExpense(expense: Expense) {
  const { filePath: _filePath, ...rest } = expense;
  return rest;
}

function originalName(file: Express.Multer.File): string {
  const decoded = Buffer.from(file.originalname, "latin1").toString("utf8");
  const base = path.basename(decoded || file.originalname || "bill");
  return base.slice(0, 120) || "bill";
}

async function mapPool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function run(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
  return results;
}

function defaultClaimTitle(count: number): string {
  const today = formatLongDate(new Date().toISOString().slice(0, 10));
  return `${today} · ${count} ${count === 1 ? "bill" : "bills"}`;
}

export function createApp(): express.Express {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      demoMode: config.demoMode,
      extraction: Boolean(config.geminiApiKey),
    });
  });

  app.use("/api", (req, res, next) => {
    if (req.path === "/health") {
      next();
      return;
    }
    void requireUser(req, res, next);
  });

  app.get(
    "/api/me",
    asyncHandler(async (req, res) => {
      res.json({ profile: profileOf(userOf(req)) });
    }),
  );

  app.put(
    "/api/me",
    asyncHandler(async (req, res) => {
      const user = userOf(req);
      const name = typeof req.body?.name === "string" ? req.body.name.trim().replace(/\s+/g, " ") : "";
      if (name.length < 2 || name.length > 80) {
        res.status(400).json({ error: "Enter your name." });
        return;
      }
      const now = new Date().toISOString();
      saveProfile(user.uid, user.email, name, now, user.role);
      res.json({ profile: profileOf({ ...user, name }) });
    }),
  );

  app.post(
    "/api/bills/extract",
    upload.array("files", MAX_BILLS_PER_UPLOAD),
    asyncHandler(async (req, res) => {
      const user = userOf(req);
      if (blocksFiling(user, res)) return;
      const files = (req.files ?? []) as Express.Multer.File[];
      if (files.length === 0) {
        res.status(400).json({ error: "Choose at least one bill." });
        return;
      }

      const readings = await mapPool(files, 3, async (file) => {
        const fileName = originalName(file);
        return {
          fileName,
          mimeType: file.mimetype || "application/octet-stream",
          bytes: file.buffer,
          reading: await readBill(file.buffer, file.mimetype || "", fileName),
        };
      });

      const now = new Date().toISOString();
      const expenses = [];
      for (const item of readings) {
        const id = crypto.randomUUID();
        const safeName = item.fileName.replace(/[^\w.\-]+/g, "_").slice(-80) || "bill";
        const relativePath = path.join(user.uid, `${id}-${safeName}`);
        const absolutePath = path.join(uploadsRoot(), relativePath);
        await fs.mkdir(path.dirname(absolutePath), { recursive: true });
        await fs.writeFile(absolutePath, item.bytes);

        const prompt = groupPrompt(
          item.reading.nature,
          item.reading.amount,
          item.reading.mealCount,
          item.reading.currency,
        );
        const accountName = getProfile(user.uid)?.name || user.name;
        const expense = insertExpense(
          {
            id,
            userId: user.uid,
            date: item.reading.date,
            vendorName: item.reading.vendorName,
            billerName: item.reading.billerName || accountName,
            amount: item.reading.amount,
            currency: item.reading.currency,
            nature: item.reading.nature,
            mealCount: item.reading.mealCount,
            isGroup: initialIsGroup(prompt.ask, item.reading.isGroupExpense),
            groupMembers: item.reading.groupMemberNames,
            aiSuggestedGroup: item.reading.isGroupExpense,
            summary: item.reading.summary,
            extractError: item.reading.extractError,
            fileName: item.fileName,
            mimeType: item.mimeType,
            filePath: relativePath,
            status: "needs_review",
          },
          now,
        );
        expenses.push(publicExpense(expense));
      }

      res.json({ expenses });
    }),
  );

  app.get(
    "/api/expenses",
    asyncHandler(async (req, res) => {
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const allowed = ["needs_review", "confirmed", "claimed"];
      if (status && !allowed.includes(status)) {
        res.status(400).json({ error: "Unknown expense status." });
        return;
      }
      const expenses = listExpenses(userOf(req).uid, status as Expense["status"] | undefined);
      res.json({ expenses: expenses.map(publicExpense) });
    }),
  );

  app.get(
    "/api/expenses/:id/file",
    asyncHandler(async (req, res) => {
      const expense = getExpense(userOf(req).uid, req.params.id);
      if (!expense) {
        res.status(404).json({ error: "Bill not found." });
        return;
      }
      const root = uploadsRoot();
      const full = path.resolve(root, expense.filePath);
      if (!full.startsWith(root + path.sep)) {
        res.status(400).json({ error: "Bill file is unavailable." });
        return;
      }
      try {
        await fs.access(full);
      } catch {
        res.status(404).json({ error: "Bill file is unavailable." });
        return;
      }
      res.type(expense.mimeType);
      res.sendFile(full);
    }),
  );

  app.get(
    "/api/expenses/:id",
    asyncHandler(async (req, res) => {
      const expense = getExpense(userOf(req).uid, req.params.id);
      if (!expense) {
        res.status(404).json({ error: "Bill not found." });
        return;
      }
      res.json({ expense: publicExpense(expense) });
    }),
  );

  app.post(
    "/api/expenses/confirm",
    asyncHandler(async (req, res) => {
      const user = userOf(req);
      if (blocksFiling(user, res)) return;
      const items: unknown[] = Array.isArray(req.body?.expenses) ? req.body.expenses : [];
      if (items.length === 0) {
        res.status(400).json({ error: "Nothing to confirm." });
        return;
      }

      const issues: { id: string; errors: string[] }[] = [];
      const ready: { id: string; value: ExpenseUpdate }[] = [];

      for (const item of items) {
        const id =
          item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string"
            ? (item as { id: string }).id
            : "";
        const existing = id ? getExpense(user.uid, id) : undefined;
        if (!existing) {
          issues.push({ id, errors: ["This bill is no longer available."] });
          continue;
        }
        if (existing.status === "claimed") {
          issues.push({ id, errors: ["This bill is already on a claim."] });
          continue;
        }
        const parsed = parseExpenseInput(item);
        const result = parsed ? validateExpense(parsed) : { ok: false as const, errors: ["This bill is incomplete."] };
        if (!result.ok) {
          issues.push({ id, errors: result.errors });
          continue;
        }
        ready.push({
          id,
          value: { ...result.value, status: "confirmed", claimId: existing.claimId },
        });
      }

      if (issues.length > 0) {
        res.status(422).json({ error: "Some bills still need details.", issues });
        return;
      }

      const now = new Date().toISOString();
      transaction(() => {
        for (const item of ready) updateExpense(user.uid, item.id, item.value, now);
      });

      res.json({
        expenses: ready.map((item) => publicExpense(getExpense(user.uid, item.id)!)),
      });
    }),
  );

  app.delete(
    "/api/expenses/:id",
    asyncHandler(async (req, res) => {
      const user = userOf(req);
      if (blocksFiling(user, res)) return;
      const existing = getExpense(user.uid, req.params.id);
      if (!existing) {
        res.status(404).json({ error: "Bill not found." });
        return;
      }
      if (existing.status === "claimed") {
        res.status(409).json({ error: "Remove this bill from its claim first." });
        return;
      }
      deleteExpense(userOf(req).uid, existing.id);
      const full = path.resolve(uploadsRoot(), existing.filePath);
      if (full.startsWith(uploadsRoot() + path.sep)) {
        await fs.rm(full, { force: true });
      }
      res.json({ ok: true });
    }),
  );

  app.get(
    "/api/summary",
    asyncHandler(async (req, res) => {
      const userId = userOf(req).uid;
      const expenses = listExpenses(userId);
      const claims = listClaims(userId).map((claim) => viewClaim(userId, claim));
      const unclaimed = expenses.filter((expense) => expense.status === "confirmed");
      const awaiting = claims.filter((claim) =>
        ["submitted", "approved", "partially_paid"].includes(claim.displayStatus),
      );
      res.json({
        needsReview: expenses.filter((expense) => expense.status === "needs_review").length,
        unclaimedCount: unclaimed.length,
        unclaimedAmount: expenseTotal(unclaimed),
        awaitingCount: awaiting.length,
        awaitingAmount: Math.round(awaiting.reduce((sum, claim) => sum + claim.outstanding, 0) * 100) / 100,
      });
    }),
  );

  app.get(
    "/api/claims",
    asyncHandler(async (req, res) => {
      const user = userOf(req);
      const claims = user.role === "admin" ? listClaimsForAdmin(user.uid) : listClaims(user.uid);
      res.json({ claims: claims.map((claim) => viewClaim(claim.userId, claim)) });
    }),
  );

  app.post(
    "/api/claims",
    asyncHandler(async (req, res) => {
      const user = userOf(req);
      if (blocksFiling(user, res)) return;
      const expenseIds: string[] = Array.isArray(req.body?.expenseIds)
        ? req.body.expenseIds.filter((id: unknown): id is string => typeof id === "string")
        : [];
      if (expenseIds.length === 0) {
        res.status(400).json({ error: "Choose at least one confirmed bill." });
        return;
      }

      const expenses = expenseIds.map((id) => getExpense(user.uid, id));
      if (expenses.some((expense) => !expense)) {
        res.status(404).json({ error: "One of those bills is no longer available." });
        return;
      }
      if (expenses.some((expense) => expense!.status !== "confirmed")) {
        res.status(409).json({ error: "Only confirmed bills can go on a claim." });
        return;
      }

      const requestedTitle = typeof req.body?.title === "string" ? req.body.title.trim() : "";
      if (requestedTitle.length > 80) {
        res.status(400).json({ error: "Claim title is too long." });
        return;
      }

      const now = new Date().toISOString();
      const claimId = crypto.randomUUID();
      transaction(() => {
        insertClaim({
          id: claimId,
          userId: user.uid,
          title: requestedTitle || defaultClaimTitle(expenses.length),
          status: "draft",
          submitterEmail: user.email,
          createdAt: now,
          submittedAt: null,
          updatedAt: now,
        });
        attachExpensesToClaim(user.uid, claimId, expenseIds, now);
      });

      const claim = getClaim(user.uid, claimId)!;
      res.status(201).json({ claim: viewClaim(user.uid, claim) });
    }),
  );

  app.get(
    "/api/claims/:id",
    asyncHandler(async (req, res) => {
      const user = userOf(req);
      const claim = claimFor(user, req.params.id);
      if (!claim) {
        res.status(404).json({ error: "Claim not found." });
        return;
      }
      res.json({
        claim: viewClaim(claim.userId, claim),
        expenses: listClaimExpenses(claim.userId, claim.id).map(publicExpense),
        payments: listPayments(claim.userId, claim.id),
      });
    }),
  );

  app.get(
    "/api/claims/:id/text",
    asyncHandler(async (req, res) => {
      const user = userOf(req);
      const claim = claimFor(user, req.params.id);
      if (!claim) {
        res.status(404).json({ error: "Claim not found." });
        return;
      }
      const view = viewClaim(claim.userId, claim);
      const text = renderClaimText(
        view,
        listClaimExpenses(claim.userId, claim.id),
        listPayments(claim.userId, claim.id),
      );
      res.type("text/plain").send(text);
    }),
  );

  app.patch(
    "/api/claims/:id",
    asyncHandler(async (req, res) => {
      const userId = userOf(req).uid;
      const claim = getClaim(userId, req.params.id);
      if (!claim) {
        res.status(404).json({ error: "Claim not found." });
        return;
      }
      const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
      if (!title || title.length > 80) {
        res.status(400).json({ error: "Enter a claim title up to 80 characters." });
        return;
      }
      updateClaim(userId, claim.id, { title }, new Date().toISOString());
      res.json({ claim: viewClaim(userId, getClaim(userId, claim.id)!) });
    }),
  );

  app.post(
    "/api/claims/:id/submit",
    asyncHandler(async (req, res) => {
      const user = userOf(req);
      if (blocksFiling(user, res)) return;
      const userId = user.uid;
      const claim = getClaim(userId, req.params.id);
      if (!claim) {
        res.status(404).json({ error: "Claim not found." });
        return;
      }
      if (claim.status !== "draft") {
        res.status(409).json({ error: "This claim is already submitted." });
        return;
      }
      const expenses = listClaimExpenses(userId, claim.id);
      if (expenses.length === 0) {
        res.status(409).json({ error: "Add a bill before submitting." });
        return;
      }
      const now = new Date().toISOString();
      updateClaim(userId, claim.id, { status: "submitted", submittedAt: now }, now);
      res.json({ claim: viewClaim(userId, getClaim(userId, claim.id)!) });
    }),
  );

  app.post(
    "/api/claims/:id/status",
    asyncHandler(async (req, res) => {
      const user = userOf(req);
      const claim = claimFor(user, req.params.id);
      if (!claim) {
        res.status(404).json({ error: "Claim not found." });
        return;
      }
      const next = req.body?.status as StoredClaimStatus;
      if ((next === "approved" || next === "rejected") && user.role !== "admin") {
        res.status(403).json({ error: "Only an admin can approve or reject a claim." });
        return;
      }
      if (next === "draft" && user.uid !== claim.userId) {
        res.status(403).json({ error: "Only the person who filed this claim can reopen it." });
        return;
      }
      const paid = paymentTotal(listPayments(claim.userId, claim.id));
      const allowed =
        (claim.status === "submitted" && (next === "approved" || next === "rejected")) ||
        (claim.status === "approved" && next === "rejected" && paid === 0) ||
        (claim.status === "rejected" && next === "draft" && paid === 0);
      if (!allowed) {
        res.status(409).json({ error: "That status change isn’t available." });
        return;
      }
      updateClaim(claim.userId, claim.id, { status: next }, new Date().toISOString());
      res.json({ claim: viewClaim(claim.userId, getClaim(claim.userId, claim.id)!) });
    }),
  );

  app.post(
    "/api/claims/:id/payments",
    asyncHandler(async (req, res) => {
      const user = userOf(req);
      if (user.role !== "admin") {
        res.status(403).json({ error: "Only an admin can log a payment." });
        return;
      }
      const claim = getClaimById(req.params.id);
      if (!claim) {
        res.status(404).json({ error: "Claim not found." });
        return;
      }
      if (claim.status === "draft" || claim.status === "rejected") {
        res.status(409).json({ error: "Submit the claim before logging a payment." });
        return;
      }

      const amount = typeof req.body?.amount === "number" ? req.body.amount : Number(req.body?.amount);
      const paidOn = typeof req.body?.paidOn === "string" ? req.body.paidOn : "";
      const reference = typeof req.body?.reference === "string" ? req.body.reference.trim() : "";
      const note = typeof req.body?.note === "string" ? req.body.note.trim() : "";
      if (!Number.isFinite(amount) || amount <= 0) {
        res.status(400).json({ error: "Enter a payment amount greater than zero." });
        return;
      }
      if (!isIsoDate(paidOn)) {
        res.status(400).json({ error: "Enter the payment date as YYYY-MM-DD." });
        return;
      }
      if (reference.length > 80 || note.length > 160) {
        res.status(400).json({ error: "Payment reference is too long." });
        return;
      }

      const now = new Date().toISOString();
      insertPayment({
        id: crypto.randomUUID(),
        claimId: claim.id,
        userId: claim.userId,
        amount: Math.round(amount * 100) / 100,
        paidOn,
        reference,
        note,
        createdAt: now,
      });
      res.status(201).json({
        claim: viewClaim(claim.userId, claim),
        payments: listPayments(claim.userId, claim.id),
      });
    }),
  );

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof multer.MulterError) {
      const message =
        error.code === "LIMIT_FILE_SIZE"
          ? "Each file must be 8 MB or smaller."
          : error.code === "LIMIT_FILE_COUNT"
            ? "You can upload up to 10 bills at a time."
            : "Those files could not be uploaded.";
      res.status(400).json({ error: message });
      return;
    }
    console.error(error);
    res.status(500).json({ error: "Something went wrong. Try again." });
  });

  return app;
}
