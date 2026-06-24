import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Brain, Sparkles, Clock, ShoppingBag, AlertTriangle, ShieldAlert } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { fetchProfile, logTransaction, pushNotification, updateProfile } from "@/lib/profile";
import { supabase } from "@/integrations/supabase/client";
import { generateAIWarning, type AIWarningResult } from "@/lib/ai.functions";
import { Header } from "@/components/Header";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

export const Route = createFileRoute("/app/intervene")({ component: InterventionPage });

const COOLDOWN_MS = 30 * 60 * 1000;

type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

type ActiveWarning = AIWarningResult & {
  id: string;
  productName: string;
  productPrice: number;
  cooldownUntil: number;
};

/** Risk from price vs wallet balance. Falls back to AI risk if no wallet balance. */
function computeRisk(price: number, walletBalance: number, fallback: RiskLevel): RiskLevel {
  if (!(walletBalance > 0)) return fallback;
  const ratio = price / walletBalance;
  if (ratio < 0.1) return "LOW";
  if (ratio <= 0.25) return "MEDIUM";
  return "HIGH";
}


function InterventionPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [active, setActive] = useState<ActiveWarning | null>(null);
  const [thinking, setThinking] = useState(false);
  const [buying, setBuying] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [now, setNow] = useState(Date.now());

  const { data: p } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: () => fetchProfile(user!.id),
    enabled: !!user,
  });

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

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

  const monthlyBudget = (p?.weekly_food_budget ?? 0) * 4;
  const risk: RiskLevel = useMemo(() => {
    if (!active) return "LOW";
    return computeRisk(active.productPrice, monthlyBudget, (active.riskLevel as RiskLevel) ?? "MEDIUM");
  }, [active, monthlyBudget]);

  const riskColor =
    risk === "HIGH" ? "text-[#f87171]" : risk === "MEDIUM" ? "text-[#f5c518]" : "text-[#4ade80]";
  const dontBuyBorder =
    risk === "HIGH" ? "border-[#f87171]/60 text-[#f87171]" :
    risk === "MEDIUM" ? "border-[#f5c518]/60 text-[#f5c518]" :
    "border-[#4ade80]/60 text-[#4ade80]";

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

  async function doPurchase(opts: { emergency: boolean }) {
    if (!user || !p || !active) return;
    if (active.productPrice > p.wallet_balance) {
      toast.error("✗ Insufficient balance");
      return;
    }
    setBuying(true);
    try {
      await updateProfile(user.id, { wallet_balance: p.wallet_balance - active.productPrice });
      const label = opts.emergency
        ? `Spending · ${active.productName} · ${risk} override`
        : `Spending · ${active.productName}`;
      await logTransaction(
        user.id,
        opts.emergency ? "purchase_override" : "purchase",
        -active.productPrice,
        label,
        "spend",
      );
      await supabase.from("ai_warnings").update({ proceeded: true }).eq("id", active.id);
      if (opts.emergency) {
        await pushNotification(
          user.id,
          "Cooldown overridden",
          `You bypassed the 30-minute reflection on "${active.productName}".`,
          "warning",
        );
      }
      qc.invalidateQueries({ queryKey: ["profile", user.id] });
      qc.invalidateQueries({ queryKey: ["txs", user.id] });
      if (opts.emergency) {
        toast.warning("⚠ Override logged. Balance updated.");
      } else {
        toast.success(`✓ Purchase confirmed. RM ${active.productPrice.toFixed(2)} deducted.`);
      }
      setOverrideOpen(false);
      setTimeout(() => {
        reset();
        if (!opts.emergency) navigate({ to: "/app/wallet" });
      }, 1200);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Purchase failed");
    } finally {
      setBuying(false);
    }
  }

  function abort() {
    toast("Purchase skipped. Good discipline!");
    reset();
  }

  function reset() {
    setActive(null);
    setName("");
    setPrice("");
  }

  const insufficient = !!p && !!active && active.productPrice > p.wallet_balance;

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
                  {risk} risk
                </span>
              </div>
              <h3 className="mt-3 text-lg font-bold">A reflective pause</h3>
              <p className="text-xs text-muted-foreground mt-1">
                {active.productName} · RM {active.productPrice.toFixed(2)}
              </p>
              <p className="mt-3 text-sm text-foreground/90 leading-relaxed">
                {active.warning || active.message}
              </p>

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
            <button
              onClick={abort}
              className={`py-3 rounded-xl border font-medium ${dontBuyBorder}`}
            >
              Don't buy
            </button>
            {risk === "LOW" ? (
              <button
                onClick={() => doPurchase({ emergency: false })}
                disabled={buying || insufficient}
                className={`py-3 rounded-xl font-semibold transition ${
                  insufficient
                    ? "bg-muted text-muted-foreground cursor-not-allowed"
                    : "bg-[#4ade80] text-background hover:bg-[#4ade80]/90 disabled:opacity-60"
                }`}
              >
                {buying ? "Processing..." : `Buy · RM ${active.productPrice.toFixed(2)}`}
              </button>
            ) : (
              <button
                disabled
                className="py-3 rounded-xl font-medium bg-muted text-muted-foreground cursor-not-allowed"
              >
                Locked
              </button>
            )}
          </div>
          {risk === "LOW" && insufficient && (
            <p className="text-xs text-destructive text-center -mt-1">Insufficient balance</p>
          )}

          {(risk === "MEDIUM" || risk === "HIGH") && (
            <button
              onClick={() => setOverrideOpen(true)}
              className="w-full py-2.5 rounded-xl border border-[#f87171]/50 text-[#f87171] text-xs font-medium flex items-center justify-center gap-2 hover:bg-[#f87171]/10 transition"
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

      <Dialog open={overrideOpen} onOpenChange={setOverrideOpen}>
        <DialogContent
          className="border-[#2a3557] bg-[#1a2340] text-white sm:max-w-sm rounded-2xl"
        >
          <div className="flex justify-center -mt-2">
            <div className="size-12 rounded-full bg-[#f87171]/15 flex items-center justify-center ring-1 ring-[#f87171]/40">
              <ShieldAlert className="size-6 text-[#f87171]" />
            </div>
          </div>
          <DialogHeader>
            <DialogTitle className="text-center text-[18px] text-white">Are you sure?</DialogTitle>
            <DialogDescription className="text-center text-sm text-white/80 leading-relaxed">
              {active && risk === "HIGH" ? (
                <>⚠ High risk purchase! Skipping reflection to buy {active.productName} for RM {active.productPrice.toFixed(2)}. This override will be logged and may reset your savings streak.</>
              ) : active ? (
                <>Emergency override — skip the 30-minute reflection and buy {active.productName} for RM {active.productPrice.toFixed(2)}? This will be logged.</>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="grid grid-cols-2 gap-3 sm:gap-3">
            <button
              onClick={() => setOverrideOpen(false)}
              disabled={buying}
              className="py-2.5 rounded-xl border border-white/20 text-white/80 font-medium hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              onClick={() => doPurchase({ emergency: true })}
              disabled={buying || insufficient}
              className="py-2.5 rounded-xl bg-[#f87171] text-white font-semibold hover:bg-[#f87171]/90 disabled:opacity-60"
            >
              {buying ? "Processing..." : "Confirm buy"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
