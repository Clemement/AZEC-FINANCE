import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Utensils, MapPin, Star, AlertTriangle, Plus, TrendingUp } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { fetchProfile } from "@/lib/profile";
import {
  RESTAURANTS,
  evaluateFoodBudget,
  logFoodPurchase,
  mealSchema,
  suggestRestaurants,
} from "@/lib/food";
import { Header } from "@/components/Header";

export const Route = createFileRoute("/app/food")({ component: FoodPage });

function FoodPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [meal, setMeal] = useState("");
  const [cost, setCost] = useState("");

  const { data: p } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: () => fetchProfile(user!.id),
    enabled: !!user,
  });

  const status = useMemo(() => (p ? evaluateFoodBudget(p) : null), [p]);
  const suggestions = useMemo(
    () => (status ? suggestRestaurants(status.remaining) : []),
    [status],
  );

  if (!p || !status) return null;

  const danger = status.usedPct >= 90 || status.willOverrun || status.overBudget;

  async function logMeal() {
    if (!user || !p) return;
    const parsed = mealSchema.safeParse({ meal: meal.trim(), cost: parseFloat(cost) });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    try {
      await logFoodPurchase(user.id, p, parsed.data);
      qc.invalidateQueries({ queryKey: ["profile", user.id] });
      qc.invalidateQueries({ queryKey: ["txs", user.id] });
      setMeal("");
      setCost("");
      toast.success("Meal logged");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="animate-float-up">
      <Header title="Food Budget" subtitle="Eat smart, spend smart" />

      <section className="px-5">
        <div className="glass rounded-3xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Remaining this week</p>
              <p className="text-3xl font-bold gold-text mt-1">RM {status.remaining.toFixed(2)}</p>
            </div>
            <div className="size-12 rounded-2xl navy-bg flex items-center justify-center">
              <Utensils className="size-5 text-primary" />
            </div>
          </div>
          <div className="mt-4 h-2.5 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${danger ? "bg-destructive" : "gold-bg"}`}
              style={{ width: `${status.usedPct}%` }}
            />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            RM {p.weekly_food_spent.toFixed(2)} of RM {p.weekly_food_budget.toFixed(2)} used
          </p>

          {p.weekly_food_budget > 0 && (
            <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
              <TrendingUp className="size-3 text-primary" />
              Projected weekly spend: <span className="gold-text font-semibold">RM {status.projected.toFixed(2)}</span>
            </div>
          )}

          {(status.overBudget || status.willOverrun || status.usedPct >= 90) && (
            <div className="mt-3 p-3 rounded-xl bg-destructive/15 border border-destructive/30 flex gap-2">
              <AlertTriangle className="size-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-xs text-destructive/90">
                {status.overBudget
                  ? "You've gone over your weekly food budget. Try the cheap eats below."
                  : status.willOverrun
                    ? `At your current pace you'll spend ~RM ${status.projected.toFixed(2)} this week — over budget.`
                    : "You're nearly out of food budget. Consider cooking at home."}
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="px-5 mt-4">
        <div className="glass rounded-2xl p-4">
          <p className="text-sm font-semibold flex items-center gap-2"><Plus className="size-4 text-primary" /> Log a meal</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <input
              value={meal}
              onChange={(e) => setMeal(e.target.value)}
              maxLength={80}
              placeholder="Meal"
              className="bg-input rounded-lg px-3 py-2.5 outline-none text-sm"
            />
            <input
              type="number"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              min="0"
              max="1000"
              step="0.01"
              placeholder="RM"
              className="bg-input rounded-lg px-3 py-2.5 outline-none text-sm gold-text font-semibold"
            />
          </div>
          <button onClick={logMeal} className="mt-3 w-full gold-bg py-2.5 rounded-lg text-sm font-semibold">Log meal</button>
        </div>
      </section>

      <section className="px-5 mt-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">
            {danger && suggestions.length > 0 ? "Cheaper picks for you" : "Cheap eats nearby"}
          </h2>
          <span className="text-[11px] text-muted-foreground flex items-center gap-1"><MapPin className="size-3 text-primary" /> Klang Valley</span>
        </div>
        <div className="space-y-3">
          {(danger && suggestions.length > 0 ? suggestions : RESTAURANTS).map((r) => (
            <div key={r.name} className="glass rounded-2xl p-4 flex items-center gap-3">
              <div className="size-12 rounded-xl gold-bg flex items-center justify-center font-bold">
                {r.name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{r.name}</p>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1"><MapPin className="size-3" />{r.area}</p>
                <p className="text-[11px] text-primary mt-0.5">{r.tag}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold gold-text">RM {r.price}</p>
                <p className="text-[11px] text-muted-foreground flex items-center gap-0.5 justify-end"><Star className="size-3 fill-primary text-primary" />{r.rating}</p>
              </div>
            </div>
          ))}
        </div>

        <a
          href="https://www.google.com/maps/search/cheap+food+near+me"
          target="_blank" rel="noopener noreferrer"
          className="mt-4 block text-center navy-bg py-3 rounded-xl text-sm font-medium"
        >
          <MapPin className="size-4 inline mr-1.5" /> Open Google Maps
        </a>
      </section>
    </div>
  );
}
