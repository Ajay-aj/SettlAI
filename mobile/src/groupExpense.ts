import type { ExpenseNature } from "./types";

export const FOOD_PER_MEAL_LIMIT = 250;

export type GroupPrompt = {
  ask: boolean;
  reason: "cab" | "food_over_limit" | null;
  perMealAmount: number | null;
};

export function perMealAmount(amount: number | null, mealCount: number | null): number | null {
  if (amount == null || !Number.isFinite(amount)) return null;
  const meals = mealCount != null && mealCount > 0 ? mealCount : 1;
  return Math.round((amount / meals) * 100) / 100;
}

export function groupPrompt(
  nature: ExpenseNature,
  amount: number | null,
  mealCount: number | null,
  currency = "INR",
): GroupPrompt {
  if (nature === "cab") return { ask: true, reason: "cab", perMealAmount: null };

  const perMeal = nature === "food" ? perMealAmount(amount, mealCount) : null;
  const inr = currency.trim().toUpperCase() === "INR" || currency.trim() === "";
  if (nature === "food" && inr && perMeal != null && perMeal > FOOD_PER_MEAL_LIMIT) {
    return { ask: true, reason: "food_over_limit", perMealAmount: perMeal };
  }
  return { ask: false, reason: null, perMealAmount: perMeal };
}
