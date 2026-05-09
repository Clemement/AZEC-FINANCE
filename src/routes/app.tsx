import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { PhoneShell } from "@/components/PhoneShell";
import { BottomNav } from "@/components/BottomNav";

export const Route = createFileRoute("/app")({ component: AppLayout });

function AppLayout() {
  const { user, loading } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);

  if (loading || !user) {
    return (
      <PhoneShell>
        <div className="flex-1 flex items-center justify-center">
          <div className="size-12 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      </PhoneShell>
    );
  }

  return (
    <PhoneShell>
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto no-scrollbar pb-2">
          <Outlet />
        </main>
        <BottomNav />
      </div>
    </PhoneShell>
  );
}
