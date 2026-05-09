import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";

export function Header({ title, subtitle, unread = 0 }: { title: string; subtitle?: string; unread?: number }) {
  return (
    <header className="px-5 pt-6 pb-3 flex items-start justify-between">
      <div>
        <p className="text-xs text-muted-foreground tracking-wide uppercase">{subtitle ?? "AZEC Finance"}</p>
        <h1 className="text-2xl font-semibold mt-0.5">{title}</h1>
      </div>
      <Link to="/app/notifications" className="relative size-10 rounded-full glass flex items-center justify-center">
        <Bell className="size-4 text-primary" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 size-4 rounded-full gold-bg text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Link>
    </header>
  );
}
