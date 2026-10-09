import assert from "node:assert/strict";
import test from "node:test";
import { displayStatus } from "./claimStatus";
import { isBusyResponse } from "./extract";
import { groupPrompt, initialIsGroup, perMealAmount } from "./groupExpense";
import { normalizeExtraction, parseBillDate, parseModelJson } from "./model";
import { validateExpense } from "./validateExpense";

const base = {
  date: "2026-10-08",
  vendorName: "Third Wave",
  billerName: "Ajay",
  amount: 180,
  currency: "INR",
  nature: "food",
  mealCount: 1,
  isGroup: false,
  groupMembers: [] as string[],
};

test("cab always asks and defaults to a personal expense", () => {
  const prompt = groupPrompt("cab", 900, null, "INR");
  assert.equal(prompt.ask, true);
  assert.equal(prompt.reason, "cab");
  assert.equal(initialIsGroup(prompt.ask, true), false);
});

test("food asks only when a meal is over 250", () => {
  assert.equal(groupPrompt("food", 250, 1, "INR").ask, false);
  assert.equal(groupPrompt("food", 250.01, 1, "INR").ask, true);
  assert.equal(groupPrompt("food", 500, 2, "INR").ask, false);
  assert.equal(groupPrompt("food", 600, 2, "INR").reason, "food_over_limit");
  assert.equal(perMealAmount(600, 2), 300);
});

test("the meal limit applies to INR bills", () => {
  assert.equal(groupPrompt("food", 400, 1, "USD").ask, false);
  assert.equal(groupPrompt("travel", 900, null, "INR").ask, false);
});

test("group cab and shared meals need names before confirm", () => {
  const cab = validateExpense({
    ...base,
    nature: "cab",
    amount: 400,
    mealCount: null,
    isGroup: true,
    groupMembers: [],
  });
  assert.equal(cab.ok, false);

  const meal = validateExpense({
    ...base,
    amount: 480,
    isGroup: true,
    groupMembers: ["Asha"],
  });
  assert.equal(meal.ok, true);
  if (meal.ok) assert.deepEqual(meal.value.groupMembers, ["Asha"]);

  const personal = validateExpense({ ...base, nature: "cab", amount: 400, mealCount: null });
  assert.equal(personal.ok, true);
  if (personal.ok) assert.equal(personal.value.isGroup, false);
});

test("a food bill at or under 250 can be confirmed without a group", () => {
  const result = validateExpense(base);
  assert.equal(result.ok, true);
});

test("model JSON keeps a day-month-year bill date", () => {
  const parsed = normalizeExtraction(
    parseModelJson('```json\n{"date":"08/10/2026","vendorName":"Uber","amount":"1,240.5","nature":"cab","isGroupExpense":"true","groupMemberNames":["Asha"," Asha ","Ben"]}\n```'),
  );
  assert.equal(parsed.date, "2026-10-08");
  assert.equal(parseBillDate("8 Oct 2026"), "2026-10-08");
  assert.equal(parseBillDate("08-Oct-2026"), "2026-10-08");
  assert.equal(parseBillDate("not a date"), null);
  assert.equal(parsed.amount, 1240.5);
  assert.equal(parsed.nature, "cab");
  assert.equal(parsed.isGroupExpense, true);
  assert.deepEqual(parsed.groupMemberNames, ["Asha", "Ben"]);
  assert.equal(parsed.mealCount, null);
});

test("a busy Gemini response can be retried", () => {
  assert.equal(isBusyResponse(503, "This model is currently experiencing high demand."), true);
  assert.equal(isBusyResponse(429, "Resource exhausted. Please try again later."), true);
  assert.equal(isBusyResponse(400, "Invalid request"), false);
});

test("payment standing follows what has been received", () => {
  assert.equal(displayStatus("submitted", 1000, 0), "submitted");
  assert.equal(displayStatus("approved", 1000, 400), "partially_paid");
  assert.equal(displayStatus("submitted", 1000, 1000), "paid");
  assert.equal(displayStatus("rejected", 1000, 0), "rejected");
  assert.equal(displayStatus("draft", 1000, 0), "draft");
});
