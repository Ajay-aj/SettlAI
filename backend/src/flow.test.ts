import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { Server } from "node:http";

const root = mkdtempSync(path.join(tmpdir(), "reimburse-"));
process.env.DATA_DIR = path.join(root, "data");
process.env.UPLOADS_DIR = path.join(root, "uploads");
process.env.DEMO_MODE = "true";
process.env.GEMINI_API_KEY = "";

test("upload, confirm, claim, and payment", async (t) => {
  const { createApp } = await import("./app");
  const { openDatabase } = await import("./db");
  openDatabase();
  const app = createApp();
  const server: Server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const base = `http://127.0.0.1:${port}`;

  t.after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    rmSync(root, { recursive: true, force: true });
  });

  async function api(pathname: string, init: RequestInit = {}, token = "demo") {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
    const response = await fetch(base + pathname, { ...init, headers });
    const text = await response.text();
    const body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    return { status: response.status, body };
  }

  const health = await fetch(base + "/api/health");
  assert.equal(health.status, 200);

  const form = new FormData();
  form.append("files", new Blob(["receipt-a"], { type: "image/jpeg" }), "lunch.jpg");
  form.append("files", new Blob(["receipt-b"], { type: "application/pdf" }), "cab.pdf");
  const extracted = await fetch(base + "/api/bills/extract", {
    method: "POST",
    headers: { Authorization: "Bearer demo" },
    body: form,
  });
  const uploaded = (await extracted.json()) as {
    expenses: Array<{ id: string; status: string; extractError: string | null }>;
  };
  assert.equal(extracted.status, 200);
  assert.equal(uploaded.expenses.length, 2);
  assert.equal(uploaded.expenses[0].status, "needs_review");
  assert.match(uploaded.expenses[0].extractError ?? "", /Gemini API key/);

  const [foodId, cabId] = uploaded.expenses.map((expense) => expense.id);
  const rejected = await api("/api/expenses/confirm", {
    method: "POST",
    body: JSON.stringify({
      expenses: [
        {
          id: foodId,
          date: "2026-10-08",
          vendorName: "Cafe",
          billerName: "",
          amount: 480,
          currency: "INR",
          nature: "food",
          mealCount: 1,
          isGroup: true,
          groupMembers: [],
        },
      ],
    }),
  });
  assert.equal(rejected.status, 422);

  const confirmed = await api("/api/expenses/confirm", {
    method: "POST",
    body: JSON.stringify({
      expenses: [
        {
          id: foodId,
          date: "2026-10-08",
          vendorName: "Cafe",
          billerName: "Ajay",
          amount: 480,
          currency: "INR",
          nature: "food",
          mealCount: 1,
          isGroup: true,
          groupMembers: ["Asha", "Ben"],
        },
        {
          id: cabId,
          date: "2026-10-08",
          vendorName: "Uber",
          billerName: "",
          amount: 320,
          currency: "INR",
          nature: "cab",
          mealCount: null,
          isGroup: false,
          groupMembers: [],
        },
      ],
    }),
  });
  assert.equal(confirmed.status, 200);

  const created = await api("/api/claims", {
    method: "POST",
    body: JSON.stringify({ expenseIds: [foodId, cabId] }),
  });
  assert.equal(created.status, 201);
  const claimId = (created.body.claim as { id: string }).id;

  const submitted = await api(`/api/claims/${claimId}/submit`, { method: "POST" });
  assert.equal(submitted.status, 200);

  const denied = await api(`/api/claims/${claimId}/payments`, {
    method: "POST",
    body: JSON.stringify({ amount: 400, paidOn: "2026-10-09", reference: "NEFT 12" }),
  });
  assert.equal(denied.status, 403);

  const approved = await api(
    `/api/claims/${claimId}/status`,
    { method: "POST", body: JSON.stringify({ status: "approved" }) },
    "admin",
  );
  assert.equal(approved.status, 200);

  const partial = await api(
    `/api/claims/${claimId}/payments`,
    {
      method: "POST",
      body: JSON.stringify({ amount: 400, paidOn: "2026-10-09", reference: "NEFT 12" }),
    },
    "admin",
  );
  assert.equal(partial.status, 201);
  assert.equal((partial.body.claim as { displayStatus: string }).displayStatus, "partially_paid");

  const paid = await api(
    `/api/claims/${claimId}/payments`,
    {
      method: "POST",
      body: JSON.stringify({ amount: 400, paidOn: "2026-10-10", reference: "NEFT 13" }),
    },
    "admin",
  );
  assert.equal((paid.body.claim as { displayStatus: string; outstanding: number }).displayStatus, "paid");
  assert.equal((paid.body.claim as { outstanding: number }).outstanding, 0);
});
