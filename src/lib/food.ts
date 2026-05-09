import { z } from "zod";
import {
  fetchProfile,
  logTransaction,
  pushNotification,
  updateProfile,
  type Profile,
} from "@/lib/profile";
import { logFoodBudget } from "@/lib/history";

export const RESTAURANTS = [
  { name: "Nasi Lemak Antarabangsa", area: "Kampung Baru, KL", price: 6, rating: 4.6, tag: "Cheap & filling" },
  { name: "Mansion Tea Stall", area: "Brickfields, KL", price: 7, rating: 4.5, tag: "Banana leaf rice" },
  { name: "Restoran Win Heng Seng", area: "Bukit Bintang, KL", price: 8, rating: 4.4, tag: "Char kuey teow" },
  { name: "Restoran Yusoof Dan Zakhir", area: "Jalan Hang Jebat", price: 9, rating: 4.3, tag: "Roti & teh tarik" },
  { name: "Ali, Muthu & Ah Hock", area: "Bangsar South", price: 10, rating: 4.5, tag: "Local kopitiam" },
] as const;

export type Restaurant = (typeof RESTAURANTS)[number];

// ---------- Validation ----------

export const mealSchema = z.object({
  meal: z
    .string()
    .trim()
    .min(1, "Enter a meal name")
    .max(80, "Meal name too long")
    .regex(/^[\p{L}\p{N} ,.'&()/-]+$/u, "Avoid special characters"),
  cost: z
    .number()
    .positive("Enter a price > 0")
    .max(1000, "Price seems too high (max RM 1000)"),
});

export type MealInput = z.infer<typeof mealSchema>;

// ---------- Math helpers ----------

/** Days elapsed in the current week (Mon=1..Sun=7), used to project pace. */
export function dayOfWeek(d: Date = new Date()): number {
  const js = d.getDay(); // 0=Sun..6=Sat
  return js === 0 ? 7 : js;
}

export function remainingBudget(p: Pick<Profile, "weekly_food_budget" | "weekly_food_spent">): number {
  return Math.max(0, p.weekly_food_budget - p.weekly_food_spent);
}

/**
 * Project weekly spending based on current pace (spent / days elapsed * 7).
 * Returns 0 if no days have elapsed yet.
 */
export function projectedWeeklySpend(spent: number, today: Date = new Date()): number {
  const dow = dayOfWeek(today);
  if (dow <= 0) return 0;
  return Math.round((spent / dow) * 7 * 100) / 100;
}

export type FoodBudgetStatus = {
  remaining: number;
  usedPct: number;
  projected: number;
  overBudget: boolean;
  willOverrun: boolean;
};

export function evaluateFoodBudget(
  p: Pick<Profile, "weekly_food_budget" | "weekly_food_spent">,
): FoodBudgetStatus {
  const budget = p.weekly_food_budget;
  const spent = p.weekly_food_spent;
  const remaining = remainingBudget(p);
  const usedPct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
  const projected = projectedWeeklySpend(spent);
  return {
    remaining,
    usedPct,
    projected,
    overBudget: budget > 0 && spent > budget,
    willOverrun: budget > 0 && projected > budget,
  };
}

/** Cheaper restaurants that fit the remaining weekly budget, sorted cheapest first. */
export function suggestRestaurants(remaining: number, limit = 3): readonly Restaurant[] {
  return [...RESTAURANTS]
    .filter((r) => r.price <= Math.max(remaining, 6))
    .sort((a, b) => a.price - b.price)
    .slice(0, limit);
}

// ---------- Mutations ----------

/**
 * Log a food purchase: deducts from wallet, adds to weekly_food_spent,
 * writes a transaction row, and pushes a warning notification on overrun.
 */
export async function logFoodPurchase(userId: string, profile: Profile, raw: unknown): Promise<Profile> {
  const { meal, cost } = mealSchema.parse(raw);
  if (cost > profile.wallet_balance) {
    throw new Error("Insufficient wallet balance");
  }

  const newSpent = profile.weekly_food_spent + cost;
  const updated = await updateProfile(userId, {
    weekly_food_spent: newSpent,
    wallet_balance: profile.wallet_balance - cost,
  });

  await logTransaction(userId, "food", -cost, meal, "food");
  await logFoodBudget({
    userId,
    budget: updated.weekly_food_budget,
    spent: updated.weekly_food_spent,
    kind: "purchase",
    meal,
    cost,
  });

  const status = evaluateFoodBudget(updated);
  if (status.overBudget) {
    await pushNotification(
      userId,
      "Food budget exceeded ⚠️",
      `You've spent RM ${updated.weekly_food_spent.toFixed(2)} of your RM ${updated.weekly_food_budget.toFixed(2)} weekly budget. Cook at home or pick a cheap eat below.`,
      "warning",
    );
  } else if (status.willOverrun) {
    await pushNotification(
      userId,
      "Pace warning",
      `At this rate you'll spend ~RM ${status.projected.toFixed(2)} this week — over your RM ${updated.weekly_food_budget.toFixed(2)} budget.`,
      "warning",
    );
  } else if (status.usedPct >= 90) {
    await pushNotification(
      userId,
      "Food budget alert",
      `You've used ${Math.round(status.usedPct)}% of your weekly food budget.`,
      "warning",
    );
  }

  return updated;
}

export { fetchProfile };
