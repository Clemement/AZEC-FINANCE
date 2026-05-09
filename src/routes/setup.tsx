import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Target, Calendar, Utensils } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { updateProfile } from "@/lib/profile";
import { logFoodBudget } from "@/lib/history";
import { PhoneShell } from "@/components/PhoneShell";

export const Route = createFileRoute("/setup")({ component: Setup });

function Setup() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [debt, setDebt] = useState("");
  const [goalDate, setGoalDate] = useState("");
  const [foodBudget, setFoodBudget] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const d = parseFloat(debt) || 0;
    const f = parseFloat(foodBudget) || 0;
    if (!goalDate) { toast.error("Pick a debt-free goal date"); return; }
    setBusy(true);
    try {
      await updateProfile(user.id, {
        debt_initial: d,
        debt_remaining: d,
        debt_free_goal_date: goalDate,
        weekly_food_budget: f,
        setup_complete: true,
      });
      toast.success("All set. Let's build the habit.");
      nav({ to: "/app/dashboard" });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally { setBusy(false); }
  }

  return (
    <PhoneShell>
      <div className="flex-1 flex flex-col px-6 pt-10 pb-6 animate-float-up">
        <p className="text-xs uppercase tracking-widest text-primary">Step 1 of 1</p>
        <h1 className="text-3xl font-bold mt-1">Your money,<br />your plan.</h1>
        <p className="text-sm text-muted-foreground mt-2">Tell us where you stand. We'll handle the discipline.</p>

        <form onSubmit={submit} className="mt-8 space-y-4 flex-1">
          <FieldBlock icon={<Target />} label="Current debt (RM)">
            <input
              type="number" step="0.01" min="0" required
              value={debt} onChange={(e) => setDebt(e.target.value)}
              placeholder="e.g. 2500"
              className="w-full bg-transparent outline-none text-2xl font-semibold gold-text"
            />
          </FieldBlock>
          <FieldBlock icon={<Calendar />} label="Debt-free goal date">
            <input
              type="date" required
              value={goalDate} onChange={(e) => setGoalDate(e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
              className="w-full bg-transparent outline-none text-base font-medium"
            />
          </FieldBlock>
          <FieldBlock icon={<Utensils />} label="Weekly food budget (RM)">
            <input
              type="number" step="0.01" min="0" required
              value={foodBudget} onChange={(e) => setFoodBudget(e.target.value)}
              placeholder="e.g. 120"
              className="w-full bg-transparent outline-none text-2xl font-semibold gold-text"
            />
          </FieldBlock>

          <button
            type="submit" disabled={busy}
            className="w-full mt-4 gold-bg glow-gold py-3.5 rounded-xl font-semibold disabled:opacity-60"
          >
            {busy ? "Saving..." : "Start my journey"}
          </button>
        </form>
      </div>
    </PhoneShell>
  );
}

function FieldBlock({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        <span className="text-primary [&>svg]:size-3.5">{icon}</span>
        <span>{label}</span>
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}
