import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Sparkles, ShieldCheck, TrendingUp } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { fetchProfile } from "@/lib/profile";
import { PhoneShell } from "@/components/PhoneShell";

export const Route = createFileRoute("/")({
  component: Splash,
});

function Splash() {
  const nav = useNavigate();
  const { user, loading } = useAuth();
  const [show, setShow] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setShow(false), 2200);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (loading || show) return;
    (async () => {
      if (!user) { nav({ to: "/auth" }); return; }
      const p = await fetchProfile(user.id);
      nav({ to: p?.setup_complete ? "/app/dashboard" : "/setup" });
    })();
  }, [show, loading, user, nav]);

  return (
    <PhoneShell>
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center relative overflow-hidden">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 size-96 rounded-full bg-primary/10 blur-3xl animate-pulse-gold" />
        <div className="relative animate-float-up">
          <div className="mx-auto size-24 rounded-3xl gold-bg glow-gold flex items-center justify-center mb-8 animate-pulse-gold">
            <Sparkles className="size-10" />
          </div>
          <h1 className="text-5xl font-extrabold tracking-tight">
            <span className="gold-text">AZEC</span>
          </h1>
          <p className="text-2xl font-light text-foreground/90 mt-1">Finance</p>
          <p className="mt-6 text-sm text-muted-foreground max-w-[260px] mx-auto leading-relaxed">
            Building Financial Discipline Through AI
          </p>

          <div className="mt-12 flex justify-center gap-6 text-muted-foreground">
            <div className="flex flex-col items-center gap-1.5"><ShieldCheck className="size-5 text-primary" /><span className="text-[10px]">Smart Vault</span></div>
            <div className="flex flex-col items-center gap-1.5"><TrendingUp className="size-5 text-primary" /><span className="text-[10px]">Debt Tracking</span></div>
            <div className="flex flex-col items-center gap-1.5"><Sparkles className="size-5 text-primary" /><span className="text-[10px]">AI Coach</span></div>
          </div>
        </div>
        <div className="absolute bottom-10 left-0 right-0 flex justify-center">
          <div className="h-1 w-32 rounded-full bg-muted overflow-hidden">
            <div className="h-full w-full shimmer" />
          </div>
        </div>
      </div>
    </PhoneShell>
  );
}
