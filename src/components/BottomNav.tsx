import { Link, useLocation } from "@tanstack/react-router";
import { Home, Wallet, Lock, Brain, Utensils } from "lucide-react";

const tabs = [
  { to: "/app/dashboard", label: "Home", Icon: Home },
  { to: "/app/wallet", label: "Wallet", Icon: Wallet },
  { to: "/app/vault", label: "Vault", Icon: Lock },
  { to: "/app/intervene", label: "AI", Icon: Brain },
  { to: "/app/food", label: "Food", Icon: Utensils },
] as const;

export function BottomNav() {
  const { pathname } = useLocation();
  return (
    <nav className="sticky bottom-0 inset-x-0 z-30 px-3 pb-3 pt-2 bg-gradient-to-t from-background via-background to-transparent">
      <div className="glass rounded-2xl px-2 py-2 flex justify-between">
        {tabs.map(({ to, label, Icon }) => {
          const active = pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-xl transition-colors ${
                active ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <div className={`p-1.5 rounded-lg ${active ? "gold-bg glow-gold" : ""}`}>
                <Icon className="size-4" />
              </div>
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
