import type { ReactNode } from "react";

export function PhoneShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen w-full flex items-stretch md:items-center justify-center md:py-8">
      <div className="w-full md:max-w-[420px] md:rounded-[2.5rem] md:border md:border-border md:overflow-hidden md:shadow-2xl bg-background relative md:min-h-[860px] flex flex-col">
        {children}
      </div>
    </div>
  );
}
