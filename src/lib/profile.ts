import { supabase } from "@/integrations/supabase/client";
import { logVaultAction } from "@/lib/history";

export type Profile = {
  id: string;
  full_name: string;
  pin: string | null;
  wallet_balance: number;
  vault_balance: number;
  debt_initial: number;
  debt_remaining: number;
  debt_free_goal_date: string | null;
  weekly_food_budget: number;
  weekly_food_spent: number;
  streak_count: number;
  last_streak_date: string | null;
  setup_complete: boolean;
};

export const VAULT_TOPUP_THRESHOLD = 200;
export const VAULT_LOCK_RATIO = 0.2;
export const STREAK_TARGET = 30;
export const STREAK_REWARD_RM = 1;

// ============================================================
// Basic CRUD helpers
// ============================================================

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

export async function updateProfile(userId: string, patch: Partial<Profile>) {
  const { data, error } = await supabase
    .from("profiles")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .select()
    .single();
  if (error) throw error;
  return data as Profile;
}

export async function logTransaction(
  userId: string,
  type: string,
  amount: number,
  description?: string,
  category?: string,
) {
  await supabase.from("transactions").insert({ user_id: userId, type, amount, description, category });
}

export async function pushNotification(
  userId: string,
  title: string,
  body: string,
  kind: "info" | "warning" | "success" = "info",
) {
  await supabase.from("notifications").insert({ user_id: userId, title, body, kind });
}

// ============================================================
// Smart Vault rules
// ============================================================

/** Returns the RM amount to lock in the vault from a top-up. */
export function calcVaultLock(topup: number): number {
  if (!Number.isFinite(topup) || topup < VAULT_TOPUP_THRESHOLD) return 0;
  return Math.round(topup * VAULT_LOCK_RATIO * 100) / 100;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(fromISO: string, toISO: string): number {
  const a = new Date(fromISO + "T00:00:00Z").getTime();
  const b = new Date(toISO + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86_400_000);
}

/**
 * Process a wallet top-up.
 * If the top-up >= RM200, automatically locks 20% into vault_balance,
 * deducts it from wallet_balance, and writes a vault transaction log.
 */
export async function processTopUp(userId: string, profile: Profile, amount: number): Promise<Profile> {
  if (!(amount > 0)) throw new Error("Top-up amount must be positive");
  const lock = calcVaultLock(amount);
  const toWallet = amount - lock;

  const updated = await updateProfile(userId, {
    wallet_balance: profile.wallet_balance + toWallet,
    vault_balance: profile.vault_balance + lock,
  });

  await logTransaction(userId, "topup", amount, `Top up RM ${amount.toFixed(2)}`, "wallet");
  if (lock > 0) {
    await logTransaction(userId, "vault_lock", lock, "Auto-locked 20% to Smart Vault", "vault");
    await pushNotification(
      userId,
      "Smart Vault locked 🔒",
      `RM ${lock.toFixed(2)} (20%) auto-locked from your top-up. Discipline.`,
      "info",
    );
  }
  return updated;
}

/**
 * Daily streak tick — call on dashboard/vault load.
 * If vault has money AND it's a new day since last_streak_date, increment streak by 1.
 * If streak hits 30, award RM1 to wallet and reset streak to 0.
 *
 * Skips silently if already ticked today, or if vault is empty.
 * Returns the updated profile (or original if no change).
 */
export async function tickStreakIfDue(userId: string, profile: Profile): Promise<Profile> {
  const today = todayISO();
  if (profile.last_streak_date === today) return profile; // already ticked
  if (profile.vault_balance <= 0) return profile; // nothing locked yet

  // Only count consecutive untouched days. If gap > 1 day, treat as fresh start at 1.
  const consecutive =
    profile.last_streak_date === null
      ? true
      : daysBetween(profile.last_streak_date, today) === 1;

  const baseStreak = consecutive ? profile.streak_count + 1 : 1;
  const hitTarget = baseStreak >= STREAK_TARGET;
  const newStreak = hitTarget ? 0 : baseStreak;
  const reward = hitTarget ? STREAK_REWARD_RM : 0;

  const updated = await updateProfile(userId, {
    streak_count: newStreak,
    last_streak_date: today,
    wallet_balance: profile.wallet_balance + reward,
  });

  if (reward > 0) {
    await logTransaction(userId, "reward", reward, "30-day streak reward", "vault");
    await pushNotification(
      userId,
      "Reward unlocked! 🎉",
      `30-day streak achieved. RM ${reward.toFixed(2)} added to your wallet.`,
      "success",
    );
  }
  return updated;
}

/**
 * Emergency unlock — releases the entire vault back to wallet and resets the streak to 0.
 */
export async function emergencyVaultUnlock(userId: string, profile: Profile): Promise<Profile> {
  if (profile.vault_balance <= 0) throw new Error("Vault is empty");
  const released = profile.vault_balance;

  const updated = await updateProfile(userId, {
    vault_balance: 0,
    wallet_balance: profile.wallet_balance + released,
    streak_count: 0,
    last_streak_date: null,
  });

  await logTransaction(userId, "vault_unlock", released, "Emergency unlock", "vault");
  await pushNotification(
    userId,
    "Streak reset",
    `You unlocked RM ${released.toFixed(2)}. Your streak resets to 0 — start again tomorrow.`,
    "warning",
  );
  return updated;
}
