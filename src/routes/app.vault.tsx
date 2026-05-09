import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Lock, Unlock, Flame, Trophy } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { fetchProfile, logTransaction, pushNotification, updateProfile } from "@/lib/profile";
import { Header } from "@/components/Header";
import { CircularProgress } from "@/components/CircularProgress";

export const Route = createFileRoute("/app/vault")({ component: VaultPage });

const STREAK_TARGET = 30;

function VaultPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const { data: p } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: () => fetchProfile(user!.id),
    enabled: !!user,
  });
  if (!p) return null;

  const streakPct = Math.min(100, (p.streak_count / STREAK_TARGET) * 100);
  const rewardReady = p.streak_count >= STREAK_TARGET;

  async function emergencyUnlock() {
    if (!user || !p) return;
    if (p.vault_balance <= 0) { toast.error("Vault is empty"); return; }
    if (!confirm(`Unlock RM ${p.vault_balance.toFixed(2)} from your Smart Vault? This will reset your streak.`)) return;
    setBusy(true);
    try {
      const released = p.vault_balance;
      await updateProfile(user.id, {
        vault_balance: 0,
        wallet_balance: p.wallet_balance + released,
        streak_count: 0,
        last_streak_date: null,
      });
      await logTransaction(user.id, "vault_unlock", released, "Emergency unlock", "vault");
      await pushNotification(user.id, "Streak reset", `You unlocked RM ${released.toFixed(2)}. Your streak resets to 0 — start again tomorrow.`, "warning");
      toast.success(`RM ${released.toFixed(2)} returned to wallet`);
      qc.invalidateQueries({ queryKey: ["profile", user.id] });
    } finally { setBusy(false); }
  }

  async function checkInDay() {
    if (!user || !p) return;
    const today = new Date().toISOString().slice(0, 10);
    if (p.last_streak_date === today) { toast.info("Already checked in today"); return; }
    if (p.vault_balance <= 0) { toast.error("Lock something in vault first"); return; }
    const newStreak = p.streak_count + 1;
    let walletBonus = 0;
    if (newStreak >= STREAK_TARGET) {
      walletBonus = 1;
    }
    await updateProfile(user.id, {
      streak_count: newStreak >= STREAK_TARGET ? 0 : newStreak,
      last_streak_date: today,
      wallet_balance: p.wallet_balance + walletBonus,
    });
    if (walletBonus > 0) {
      await pushNotification(user.id, "Reward unlocked! 🎉", "30-day streak achieved. RM 1 added to your wallet.", "success");
      await logTransaction(user.id, "reward", 1, "30-day streak reward", "vault");
      toast.success("Reward unlocked: RM 1");
    } else {
      toast.success(`Streak: ${newStreak} day${newStreak > 1 ? "s" : ""}`);
    }
    qc.invalidateQueries({ queryKey: ["profile", user.id] });
  }

  return (
    <div className="animate-float-up">
      <Header title="Smart Vault" subtitle="Locked Savings" />
      <section className="px-5">
        <div className="glass rounded-3xl p-6 text-center relative overflow-hidden">
          <div className="absolute -top-20 -left-20 size-56 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative">
            <div className="mx-auto size-14 rounded-2xl gold-bg glow-gold flex items-center justify-center mb-3">
              <Lock className="size-6" />
            </div>
            <p className="text-xs text-muted-foreground">Locked balance</p>
            <p className="text-4xl font-bold gold-text mt-1">RM {p.vault_balance.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground mt-2">Auto-locks 20% of every top-up ≥ RM 200</p>
          </div>
        </div>
      </section>

      <section className="px-5 mt-4 grid grid-cols-2 gap-3">
        <div className="glass rounded-2xl p-4 flex flex-col items-center text-center">
          <CircularProgress value={streakPct} size={104} stroke={9} label={`${p.streak_count}`} sublabel={`/ ${STREAK_TARGET} days`} />
          <p className="mt-2 text-xs text-muted-foreground flex items-center gap-1"><Flame className="size-3 text-primary" /> Streak progress</p>
        </div>
        <div className="glass rounded-2xl p-4 flex flex-col items-center text-center justify-center">
          <Trophy className={`size-8 ${rewardReady ? "text-primary" : "text-muted-foreground"}`} />
          <p className="mt-2 text-xs text-muted-foreground">Reward at 30 days</p>
          <p className={`text-lg font-bold ${rewardReady ? "gold-text" : ""}`}>
            {rewardReady ? "Ready!" : "RM 1"}
          </p>
        </div>
      </section>

      <section className="px-5 mt-4 space-y-3">
        <button
          onClick={checkInDay}
          className="w-full gold-bg glow-gold py-3.5 rounded-xl font-semibold"
        >
          Daily check-in (don't touch vault)
        </button>
        <button
          onClick={emergencyUnlock} disabled={busy}
          className="w-full border border-destructive/50 text-destructive py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Unlock className="size-4" /> Emergency unlock
        </button>
        <p className="text-[11px] text-muted-foreground text-center px-4">
          Unlocking resets your streak. Vault discipline builds wealth.
        </p>
      </section>
    </div>
  );
}
