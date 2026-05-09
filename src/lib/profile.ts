import { supabase } from "@/integrations/supabase/client";

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

export async function logTransaction(userId: string, type: string, amount: number, description?: string, category?: string) {
  await supabase.from("transactions").insert({ user_id: userId, type, amount, description, category });
}

export async function pushNotification(userId: string, title: string, body: string, kind: "info" | "warning" | "success" = "info") {
  await supabase.from("notifications").insert({ user_id: userId, title, body, kind });
}

/** Smart Vault rule: top-up >= 200 RM => lock 20% in vault */
export function calcVaultLock(topup: number) {
  return topup >= 200 ? Math.round(topup * 0.2 * 100) / 100 : 0;
}
