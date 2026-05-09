import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Brain, Sparkles, Clock, ShoppingBag } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { fetchProfile, logTransaction, pushNotification, updateProfile } from "@/lib/profile";
import { supabase } from "@/integrations/supabase/client";
import { generateAIWarning } from "@/lib/ai.functions";
import { Header } from "@/components/Header";

export const Route = createFileRoute("/app/intervene")({ component: InterventionPage });

const COOLDOWN_MS = 30 * 60 * 1000;

function InterventionPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [warning, setWarning] = useState<string | null>(null);
  const [warningId, setWarningId] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  const { data: p } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: () => fetchProfile(user!.id),
    enabled: !!user,
  });

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const remaining = cooldownUntil ? Math.max(0, cooldownUntil - now) : 0;
  const onCooldown = remaining > 0;

  async function reflect(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !p) return;
    const pr = parseFloat(price);
    if (!name || !(pr > 0)) { toast.error("Enter product details"); return; }
    setThinking(true);
    try {
      const { message } = await generateAIWarning({
        data: {
          productName: name,
          productPrice: pr,
          walletBalance: p.wallet_balance,
          debtRemaining: p.debt_remaining,
          weeklyFoodBudget: p.weekly_food_budget,
          weeklyFoodSpent: p.weekly_food_spent,
        },
      });
      const cooldown = new Date(Date.now() + COOLDOWN_MS).toISOString();
      const { data } = await supabase.from("ai_warnings").insert({
        user_id: user.id, product_name: name, product_price: pr,
        warning_message: message, cooldown_until: cooldown,
      }).select().single();
      setWarning(message);
      setWarningId(data?.id ?? null);
      setCooldownUntil(Date.now() + COOLDOWN_MS);
      await pushNotification(user.id, "AI intervention triggered", `Reflect for 30 minutes before buying "${name}".`, "warning");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "AI failed");
    } finally { setThinking(false); }
  }

  async function proceedAnyway() {
    if (!user || !p || !warningId) return;
    if (onCooldown) { toast.error("Wait for cooldown to end"); return; }
    const pr = parseFloat(price);
    if (pr > p.wallet_balance) { toast.error("Insufficient wallet"); return; }
    await updateProfile(user.id, { wallet_balance: p.wallet_balance - pr });
    await logTransaction(user.id, "purchase", -pr, `Bought: ${name}`, "spend");
    await supabase.from("ai_warnings").update({ proceeded: true }).eq("id", warningId);
    qc.invalidateQueries({ queryKey: ["profile", user.id] });
    toast.success("Purchase recorded");
    setWarning(null); setWarningId(null); setName(""); setPrice(""); setCooldownUntil(null);
  }

  function abort() {
    toast.success("Smart choice. Money saved.");
    setWarning(null); setWarningId(null); setName(""); setPrice(""); setCooldownUntil(null);
  }

  const mm = Math.floor(remaining / 60000);
  const ss = Math.floor((remaining % 60000) / 1000);

  return (
    <div className="animate-float-up">
      <Header title="AI Coach" subtitle="Spending intervention" />

      {!warning && (
        <section className="px-5">
          <div className="glass rounded-2xl p-5">
            <div className="flex items-center gap-2 text-primary text-sm font-medium">
              <Brain className="size-4" /> Simulate a purchase
            </div>
            <p className="text-xs text-muted-foreground mt-1">Our AI coach will reflect with you before approving impulse buys.</p>
            <form onSubmit={reflect} className="mt-4 space-y-3">
              <div className="bg-input rounded-xl px-4 py-3 flex items-center gap-2">
                <ShoppingBag className="size-4 text-primary" />
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Product name" className="bg-transparent outline-none flex-1 text-sm" />
              </div>
              <div className="bg-input rounded-xl px-4 py-3">
                <p className="text-[11px] text-muted-foreground">Price (RM)</p>
                <input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)}
                  placeholder="0.00" className="mt-0.5 bg-transparent outline-none w-full text-2xl font-semibold gold-text" />
              </div>
              <button type="submit" disabled={thinking}
                className="w-full gold-bg glow-gold py-3.5 rounded-xl font-semibold disabled:opacity-60 flex items-center justify-center gap-2">
                {thinking ? "Reflecting..." : <><Sparkles className="size-4" /> Ask AI Coach</>}
              </button>
            </form>
          </div>
        </section>
      )}

      {warning && (
        <section className="px-5 animate-float-up">
          <div className="rounded-2xl p-5 ring-gold relative overflow-hidden">
            <div className="absolute inset-0 navy-bg opacity-90" />
            <div className="relative">
              <div className="size-12 rounded-2xl gold-bg glow-gold flex items-center justify-center">
                <Brain className="size-6" />
              </div>
              <h3 className="mt-3 text-lg font-bold">A reflective pause</h3>
              <p className="mt-2 text-sm text-foreground/90 leading-relaxed">{warning}</p>
              <div className="mt-4 p-3 rounded-xl bg-background/50 flex items-center gap-2">
                <Clock className="size-4 text-primary" />
                <p className="text-sm font-mono">
                  {onCooldown ? <>Cooldown <b className="gold-text">{String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}</b></> : "Cooldown complete"}
                </p>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <button onClick={abort} className="py-3 rounded-xl border border-success/40 text-success font-medium">Don't buy</button>
                <button onClick={proceedAnyway} disabled={onCooldown}
                  className={`py-3 rounded-xl font-medium ${onCooldown ? "bg-muted text-muted-foreground" : "bg-destructive/20 text-destructive border border-destructive/40"}`}>
                  Proceed anyway
                </button>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
