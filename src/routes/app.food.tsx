import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Utensils, MapPin, Star, AlertTriangle, Plus } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { fetchProfile, logTransaction, pushNotification, updateProfile } from "@/lib/profile";
import { Header } from "@/components/Header";

export const Route = createFileRoute("/app/food")({ component: FoodPage });

const RESTAURANTS = [
  { name: "Nasi Lemak Antarabangsa", area: "Kampung Baru, KL", price: 6, rating: 4.6, tag: "Cheap & filling" },
  { name: "Restoran Win Heng Seng", area: "Bukit Bintang, KL", price: 8, rating: 4.4, tag: "Char kuey teow" },
  { name: "Mansion Tea Stall", area: "Brickfields, KL", price: 7, rating: 4.5, tag: "Banana leaf rice" },
  { name: "Restoran Yusoof Dan Zakhir", area: "Jalan Hang Jebat", price: 9, rating: 4.3, tag: "Roti & teh tarik" },
  { name: "Ali, Muthu & Ah Hock", area: "Bangsar South", price: 10, rating: 4.5, tag: "Local kopitiam" },
];

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
  if (!p) return null;

  const remaining = Math.max(0, p.weekly_food_budget - p.weekly_food_spent);
  const pct = p.weekly_food_budget > 0 ? Math.min(100, (p.weekly_food_spent / p.weekly_food_budget) * 100) : 0;
  const danger = pct >= 90;

  async function logMeal() {
    if (!user || !p) return;
    const c = parseFloat(cost);
    if (!meal || !(c > 0)) { toast.error("Enter meal & price"); return; }
    if (c > p.wallet_balance) { toast.error("Insufficient wallet balance"); return; }
    const newSpent = p.weekly_food_spent + c;
    await updateProfile(user.id, {
      weekly_food_spent: newSpent,
      wallet_balance: p.wallet_balance - c,
    });
    await logTransaction(user.id, "food", -c, meal, "food");
    if (p.weekly_food_budget > 0 && newSpent / p.weekly_food_budget >= 0.9) {
      await pushNotification(user.id, "Food budget alert ⚠️", `You've used ${Math.round((newSpent / p.weekly_food_budget) * 100)}% of your weekly budget.`, "warning");
    }
    qc.invalidateQueries({ queryKey: ["profile", user.id] });
    setMeal(""); setCost("");
    toast.success("Meal logged");
  }

  return (
    <div className="animate-float-up">
      <Header title="Food Budget" subtitle="Eat smart, spend smart" />

      <section className="px-5">
        <div className="glass rounded-3xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Remaining this week</p>
              <p className="text-3xl font-bold gold-text mt-1">RM {remaining.toFixed(2)}</p>
            </div>
            <div className="size-12 rounded-2xl navy-bg flex items-center justify-center">
              <Utensils className="size-5 text-primary" />
            </div>
          </div>
          <div className="mt-4 h-2.5 rounded-full bg-muted overflow-hidden">
            <div className={`h-full rounded-full transition-all ${danger ? "bg-destructive" : "gold-bg"}`} style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">RM {p.weekly_food_spent.toFixed(2)} of RM {p.weekly_food_budget.toFixed(2)} used</p>
          {danger && (
            <div className="mt-3 p-3 rounded-xl bg-destructive/15 border border-destructive/30 flex gap-2">
              <AlertTriangle className="size-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-xs text-destructive/90">AI alert: You're nearly out of food budget. Consider cooking at home or the cheap eats below.</p>
            </div>
          )}
        </div>
      </section>

      <section className="px-5 mt-4">
        <div className="glass rounded-2xl p-4">
          <p className="text-sm font-semibold flex items-center gap-2"><Plus className="size-4 text-primary" /> Log a meal</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <input value={meal} onChange={(e) => setMeal(e.target.value)} placeholder="Meal" className="bg-input rounded-lg px-3 py-2.5 outline-none text-sm" />
            <input type="number" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="RM" className="bg-input rounded-lg px-3 py-2.5 outline-none text-sm gold-text font-semibold" />
          </div>
          <button onClick={logMeal} className="mt-3 w-full gold-bg py-2.5 rounded-lg text-sm font-semibold">Log meal</button>
        </div>
      </section>

      <section className="px-5 mt-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">Cheap eats nearby</h2>
          <span className="text-[11px] text-muted-foreground flex items-center gap-1"><MapPin className="size-3 text-primary" /> Klang Valley</span>
        </div>
        <div className="space-y-3">
          {RESTAURANTS.map((r) => (
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
