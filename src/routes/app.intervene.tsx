import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Brain, Sparkles, Clock, ShoppingBag, AlertTriangle, ShieldAlert } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { fetchProfile, logTransaction, pushNotification, updateProfile } from "@/lib/profile";
import { supabase } from "@/integrations/supabase/client";
import { generateAIWarning, type AIWarningResult } from "@/lib/ai.functions";
import { Header } from "@/components/Header";

export const Route = createFileRoute("/app/intervene")({ component: InterventionPage });

const COOLDOWN_MS = 30 * 60 * 1000;

type ActiveWarning = AIWarningResult & {
  id: string;
  productName: string;
  productPrice: number;
  cooldownUntil: number;
};

function InterventionPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [active, setActive] = useState<ActiveWarning | null>(null);
  const [thinking, setThinking] = useState(false);
  const [buying, setBuying] = useState(false);
  const [now, setNow] = useState(Date.now());

  const { data: p } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: () => fetchProfile(user!.id),
    enabled: !!user,
  });

  // 1s ticking clock for the countdown
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Restore an in-flight cooldown when the user reloads / re-enters the page
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("ai_warnings")
        .select("*")
        .eq("user_id", user.id)
        .eq("proceeded", false)
        .gt("cooldown_until", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data && !active) {
        setActive({
          id: data.id,
          productName: data.product_name ?? "",
          productPrice: Number(data.product_price ?? 0),
          cooldownUntil: new Date(data.cooldown_until!).getTime(),
          message: data.warning_message ?? "",
          warning: data.warning_message ?? "",
          questions: [],
          riskLevel: "MEDIUM",
          recommendation: "",
        });
        setName(data.product_name ?? "");
        setPrice(String(data.product_price ?? ""));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const remaining = active ? Math.max(0, active.cooldownUntil - now) : 0;
  const onCooldown = remaining > 0;
  const mm = Math.floor(remaining / 60000);
  const ss = Math.floor((remaining % 60000) / 1000);
  const pct = active ? Math.min(100, (1 - remaining / COOLDOWN_MS) * 100) : 0;

  async function reflect(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !p) return;
    const pr = parseFloat(price);
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 80 || !(pr > 0) || pr > 1_000_000) {
      toast.error("Enter a valid product name and price");
      return;
    }
    setThinking(true);
    try {
      const result = await generateAIWarning({
        data: {
          productName: trimmed,
          productPrice: pr,
          walletBalance: p.wallet_balance,
          debtRemaining: p.debt_remaining,
          weeklyFoodBudget: p.weekly_food_budget,
          weeklyFoodSpent: p.weekly_food_spent,
        },
      });
      const cooldownIso = new Date(Date.now() + COOLDOWN_MS).toISOString();
      const { data } = await supabase
        .from("ai_warnings")
        .insert({
          user_id: user.id,
          product_name: trimmed,
          product_price: pr,
          warning_message: result.warning ?? result.message,
          cooldown_until: cooldownIso,
        })
        .select()
        .single();
      setActive({
        id: data!.id,
        productName: trimmed,
        productPrice: pr,
        cooldownUntil: Date.now() + COOLDOWN_MS,
        ...result,
      });
      await pushNotification(
        user.id,
        "AI intervention triggered",
        `Reflect for 30 minutes before buying "${trimmed}".`,
        "warning",
      );
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "AI failed");
    } finally {
      setThinking(false);
    }
  }

  async function proceedAnyway(emergency = false) {
    if (!user || !p || !active) return;
    if (onCooldown && !emergency) {
      toast.error("Wait for cooldown to end");
      return;
    }
    if (emergency) {
      const ok = confirm(
        `Emergency override — skip the ${Math.ceil(remaining / 60000)}-minute reflection and buy "${active.productName}" for RM ${active.productPrice.toFixed(2)}?\n\nThis will be logged.`,
      );
      if (!ok) return;
    }
    if (active.productPrice > p.wallet_balance) {
      toast.error("Insufficient wallet");
      return;
    }
    await updateProfile(user.id, { wallet_balance: p.wallet_balance - active.productPrice });
    await logTransaction(
      user.id,
      emergency ? "purchase_override" : "purchase",
      -active.productPrice,
      `${emergency ? "[Override] " : ""}Bought: ${active.productName}`,
      "spend",
    );
    await supabase.from("ai_warnings").update({ proceeded: true }).eq("id", active.id);
    if (emergency) {
      await pushNotification(
        user.id,
        "Cooldown overridden",
        `You bypassed the 30-minute reflection on "${active.productName}".`,
        "warning",
      );
    }
    qc.invalidateQueries({ queryKey: ["profile", user.id] });
    qc.invalidateQueries({ queryKey: ["txs", user.id] });
    toast.success("Purchase recorded");
    reset();
  }

  async function buyLowRisk() {
    if (!user || !p || !active) return;
    if (active.productPrice > p.wallet_balance) {
      toast.error("Insufficient balance");
      return;
    }
    setBuying(true);
    try {
      await updateProfile(user.id, { wallet_balance: p.wallet_balance - active.productPrice });
      await logTransaction(
        user.id,
        "purchase",
        -active.productPrice,
        `Bought: ${active.productName}`,
        "spend",
      );
      await supabase.from("ai_warnings").update({ proceeded: true }).eq("id", active.id);
      qc.invalidateQueries({ queryKey: ["profile", user.id] });
      qc.invalidateQueries({ queryKey: ["txs", user.id] });
      toast.success(`Purchase confirmed. RM ${active.productPrice.toFixed(2)} deducted.`);
      setTimeout(() => {
        reset();
        navigate({ to: "/app/wallet" });
      }, 1500);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Purchase failed");
      setBuying(false);
    }
  }

  function abort() {
    toast.success("Smart choice. Money saved.");
    reset();
  }

  function reset() {
    setActive(null);
    setName("");
    setPrice("");
  }

  const riskColor =
    active?.riskLevel === "HIGH"
      ? "text-destructive"
      : active?.riskLevel === "MEDIUM"
        ? "text-primary"
        : "text-success";

  return (
    <div className="animate-float-up">
      <Header title="AI Coach" subtitle="Spending intervention" />

      {!active && (
        <section className="px-5">
          <div className="glass rounded-2xl p-5">
            <div className="flex items-center gap-2 text-primary text-sm font-medium">
              <Brain className="size-4" /> Simulate a purchase
            </div>
            <p className="text-xs text-muted-foreground mt-1">Our AI coach will reflect with you before approving impulse buys.</p>
            <form onSubmit={reflect} className="mt-4 space-y-3">
              <div className="bg-input rounded-xl px-4 py-3 flex items-center gap-2">
                <ShoppingBag className="size-4 text-primary" />
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                  placeholder="Product name"
                  className="bg-transparent outline-none flex-1 text-sm"
                />
              </div>
              <div className="bg-input rounded-xl px-4 py-3">
                <p className="text-[11px] text-muted-foreground">Price (RM)</p>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1000000"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0.00"
                  className="mt-0.5 bg-transparent outline-none w-full text-2xl font-semibold gold-text"
                />
              </div>
              <button
                type="submit"
                disabled={thinking}
                className="w-full gold-bg glow-gold py-3.5 rounded-xl font-semibold disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {thinking ? "Reflecting..." : <><Sparkles className="size-4" /> Ask AI Coach</>}
              </button>
            </form>
          </div>
        </section>
      )}

      {active && (
        <section className="px-5 animate-float-up space-y-4">
          <div className="rounded-2xl p-5 ring-gold relative overflow-hidden">
            <div className="absolute inset-0 navy-bg opacity-90" />
            <div className="relative">
              <div className="flex items-start justify-between gap-3">
                <div className="size-12 rounded-2xl gold-bg glow-gold flex items-center justify-center">
                  <Brain className="size-6" />
                </div>
                <span className={`text-[11px] font-bold uppercase tracking-wider ${riskColor}`}>
                  {active.riskLevel} risk
                </span>
              </div>
              <h3 className="mt-3 text-lg font-bold">A reflective pause</h3>
              <p className="text-xs text-muted-foreground mt-1">
                {active.productName} · RM {active.productPrice.toFixed(2)}
              </p>
              <p className="mt-3 text-sm text-foreground/90 leading-relaxed">
                {active.warning || active.message}
              </p>

              {/* Cooldown timer */}
              <div className="mt-4 p-3 rounded-xl bg-background/50">
                <div className="flex items-center gap-2">
                  <Clock className="size-4 text-primary" />
                  <p className="text-sm font-mono flex-1">
                    {onCooldown ? (
                      <>Cooldown <b className="gold-text">{String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}</b></>
                    ) : (
                      <span className="text-success font-semibold">Cooldown complete</span>
                    )}
                  </p>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full gold-bg transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            </div>
          </div>

          {active.questions.length > 0 && (
            <div className="glass rounded-2xl p-4">
              <p className="text-xs font-semibold text-primary mb-2">Reflect on these:</p>
              <ul className="space-y-2">
                {active.questions.map((q, i) => (
                  <li key={i} className="text-sm text-foreground/90 flex gap-2">
                    <span className="gold-text font-bold">{i + 1}.</span>
                    <span>{q}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {active.recommendation && (
            <div className="glass rounded-2xl p-4">
              <p className="text-xs font-semibold text-primary mb-1">Coach's tip</p>
              <p className="text-sm text-foreground/90">{active.recommendation}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <button onClick={abort} className="py-3 rounded-xl border border-success/40 text-success font-medium">
              Don't buy
            </button>
            <button
              onClick={() => proceedAnyway(false)}
              disabled={onCooldown}
              className={`py-3 rounded-xl font-medium ${
                onCooldown
                  ? "bg-muted text-muted-foreground cursor-not-allowed"
                  : "bg-destructive/20 text-destructive border border-destructive/40"
              }`}
            >
              {onCooldown ? "Locked" : "Proceed anyway"}
            </button>
          </div>

          {onCooldown && (
            <button
              onClick={() => proceedAnyway(true)}
              className="w-full py-2.5 rounded-xl border border-destructive/40 text-destructive/90 text-xs font-medium flex items-center justify-center gap-2 hover:bg-destructive/10 transition"
            >
              <ShieldAlert className="size-3.5" />
              Emergency override (skip cooldown)
            </button>
          )}

          <p className="text-[11px] text-muted-foreground text-center flex items-center justify-center gap-1">
            <AlertTriangle className="size-3" />
            Overrides are logged and may affect your streak.
          </p>
        </section>
      )}
    </div>
  );
}
