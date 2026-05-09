import { supabase } from "@/integrations/supabase/client";

/** ISO date for the Monday of the current week (UTC). */
export function weekStartISO(d: Date = new Date()): string {
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? 6 : day - 1; // back to Monday
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff));
  return m.toISOString().slice(0, 10);
}

export async function logFoodBudget(row: {
  userId: string;
  budget: number;
  spent: number;
  kind: "budget_set" | "purchase";
  meal?: string;
  cost?: number;
}) {
  const { error } = await supabase.from("food_budget").insert({
    user_id: row.userId,
    week_start: weekStartISO(),
    budget: row.budget,
    spent: row.spent,
    meal: row.meal ?? null,
    cost: row.cost ?? null,
    kind: row.kind,
  });
  if (error) console.error("food_budget insert failed", error);
}

export async function logVaultAction(row: {
  userId: string;
  action: "lock" | "unlock" | "reward" | "streak_tick";
  amount: number;
  vaultBalanceAfter: number;
  walletBalanceAfter: number;
  streakAfter: number;
  note?: string;
}) {
  const { error } = await supabase.from("vault_logs").insert({
    user_id: row.userId,
    action: row.action,
    amount: row.amount,
    vault_balance_after: row.vaultBalanceAfter,
    wallet_balance_after: row.walletBalanceAfter,
    streak_after: row.streakAfter,
    note: row.note ?? null,
  });
  if (error) console.error("vault_logs insert failed", error);
}
