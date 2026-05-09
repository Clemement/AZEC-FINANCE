import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Bell, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";

export const Route = createFileRoute("/app/notifications")({ component: NotifPage });

type N = { id: string; title: string; body: string | null; kind: string; read: boolean; created_at: string };

function NotifPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: items } = useQuery({
    queryKey: ["notifs", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("notifications").select("*")
        .eq("user_id", user!.id).order("created_at", { ascending: false }).limit(50);
      return (data ?? []) as N[];
    },
    enabled: !!user,
  });

  // Mark all as read on view
  useEffect(() => {
    if (!user) return;
    supabase.from("notifications").update({ read: true }).eq("user_id", user.id).eq("read", false)
      .then(() => qc.invalidateQueries({ queryKey: ["notif-count", user.id] }));
  }, [user, qc]);

  return (
    <div className="animate-float-up">
      <Header title="Notifications" subtitle="AI coach & alerts" />
      <section className="px-5">
        {(items ?? []).length === 0 && (
          <div className="glass rounded-2xl p-8 text-center text-muted-foreground">
            <Bell className="size-8 mx-auto mb-2 text-primary" />
            <p className="text-sm">No notifications yet.</p>
            <p className="text-xs mt-1">Top up, log meals, or simulate a purchase to see AI nudges.</p>
          </div>
        )}
        <div className="space-y-3">
          {(items ?? []).map((n) => {
            const Icon = n.kind === "warning" ? AlertTriangle : n.kind === "success" ? CheckCircle2 : Info;
            const tone = n.kind === "warning" ? "text-warning" : n.kind === "success" ? "text-success" : "text-primary";
            return (
              <div key={n.id} className="glass rounded-2xl p-4 flex gap-3">
                <div className={`size-9 rounded-xl bg-background/50 flex items-center justify-center ${tone}`}>
                  <Icon className="size-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{n.title}</p>
                  {n.body && <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{n.body}</p>}
                  <p className="text-[10px] text-muted-foreground mt-1.5">{new Date(n.created_at).toLocaleString("en-MY")}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
