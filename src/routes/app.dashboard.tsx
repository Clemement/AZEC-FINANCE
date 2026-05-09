import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { fetchProfile } from "@/lib/profile";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { CircularProgress } from "@/components/CircularProgress";
import { Lock, Wallet, TrendingDown, Flame, Utensils, ArrowRight, LogOut, Sparkles } from "lucide-react";

export const Route = createFileRoute("/app/dashboard")({ component: Dashboard });

function Dashboard() {
  const { user, signOut } = useAuth();
  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: () => fetchProfile(user!.id),
    enabled: !!user,
  });
  const { data: notifs } = useQuery({
    queryKey: ["notif-count", user?.id],
    queryFn: async () => {
      const { count } = await supabase.from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user!.id).eq("read", false);
      return count ?? 0;
    },
    enabled: !!user,
  });

  if (!profile) return <div className="p-6 text-muted-foreground">Loading…</div>;

  const debtPct = profile.debt_initial > 0
    ? Math.round(((profile.debt_initial - profile.debt_remaining) / profile.debt_initial) * 100)
    : 0;
  const foodPct = profile.weekly_food_budget > 0
    ? Math.min(100, Math.round((profile.weekly_food_spent / profile.weekly_food_budget) * 100))
    : 0;

  return (
    <div className="px-1 animate-float-up">
      <Header title={`Hi, ${profile.full_name.split(" ")[0]}`} subtitle="AZEC Finance" unread={notifs ?? 0} />

      {/* Wallet hero card */}
      <section className="px-5 mt-2">
        <div className="glass rounded-3xl p-5 relative overflow-hidden">
          <div className="absolute -top-12 -right-12 size-40 rounded-full bg-primary/15 blur-2xl" />
          <div className="flex justify-between items-start relative">
            <div>
              <p className="text-xs text-muted-foreground">Wallet Balance</p>
              <p className="text-4xl font-bold mt-1 gold-text">RM {profile.wallet_balance.toFixed(2)}</p>
            </div>
            <button onClick={signOut} className="size-9 rounded-full glass flex items-center justify-center text-muted-foreground hover:text-foreground" title="Sign out">
              <LogOut className="size-4" />
            </button>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 relative">
            <Link to="/app/wallet" className="navy-bg rounded-xl px-3 py-2.5 text-sm font-medium flex items-center justify-between">
              <span className="flex items-center gap-2"><Wallet className="size-4" /> Top up</span>
              <ArrowRight className="size-3.5 opacity-60" />
            </Link>
            <Link to="/app/vault" className="rounded-xl px-3 py-2.5 text-sm font-medium border border-primary/40 flex items-center justify-between text-primary">
              <span className="flex items-center gap-2"><Lock className="size-4" /> Vault</span>
              <ArrowRight className="size-3.5 opacity-60" />
            </Link>
          </div>
        </div>
      </section>

      {/* Stats grid */}
      <section className="px-5 mt-4 grid grid-cols-2 gap-3">
        <StatTile
          icon={<Lock className="size-4" />} label="Smart Vault"
          value={`RM ${profile.vault_balance.toFixed(2)}`}
          accent
        />
        <StatTile
          icon={<TrendingDown className="size-4" />} label="Debt left"
          value={`RM ${profile.debt_remaining.toFixed(2)}`}
        />
        <div className="glass rounded-2xl p-4 col-span-2 flex items-center gap-4">
          <CircularProgress value={debtPct} size={88} stroke={8} label={`${debtPct}%`} sublabel="paid off" />
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">Debt-free goal</p>
            <p className="text-sm font-semibold mt-0.5">
              {profile.debt_free_goal_date ? new Date(profile.debt_free_goal_date).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" }) : "—"}
            </p>
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Flame className="size-3.5 text-primary" />
              <span><b className="text-foreground">{profile.streak_count}</b>-day vault streak</span>
            </div>
          </div>
        </div>
      </section>

      {/* Food budget */}
      <section className="px-5 mt-4">
        <Link to="/app/food" className="block glass rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="size-8 rounded-lg navy-bg flex items-center justify-center"><Utensils className="size-4 text-primary" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Weekly food budget</p>
                <p className="text-sm font-semibold">RM {profile.weekly_food_spent.toFixed(2)} / RM {profile.weekly_food_budget.toFixed(2)}</p>
              </div>
            </div>
            <ArrowRight className="size-4 text-muted-foreground" />
          </div>
          <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${foodPct >= 90 ? "bg-destructive" : "gold-bg"}`}
              style={{ width: `${foodPct}%` }}
            />
          </div>
        </Link>
      </section>

      {/* AI prompt card */}
      <section className="px-5 mt-4 mb-2">
        <Link to="/app/intervene" className="block rounded-2xl p-4 ring-gold relative overflow-hidden">
          <div className="absolute inset-0 navy-bg opacity-90" />
          <div className="relative flex items-center gap-3">
            <div className="size-10 rounded-xl gold-bg flex items-center justify-center"><Sparkles className="size-5" /></div>
            <div className="flex-1">
              <p className="text-sm font-semibold">AI Spending Coach</p>
              <p className="text-xs text-muted-foreground">Reflect before you buy. Beat impulse spending.</p>
            </div>
            <ArrowRight className="size-4 text-primary" />
          </div>
        </Link>
      </section>
    </div>
  );
}

function StatTile({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl p-4 ${accent ? "ring-gold glass" : "glass"}`}>
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        <span className={accent ? "text-primary" : ""}>{icon}</span>
        <span>{label}</span>
      </div>
      <p className={`mt-2 text-xl font-bold ${accent ? "gold-text" : ""}`}>{value}</p>
    </div>
  );
}
