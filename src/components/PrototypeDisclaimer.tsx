import { ShieldAlert } from "lucide-react";

/**
 * Prototype disclaimer banner. Communicates that the app is a hackathon
 * prototype and all wallet/payment activity is simulated.
 */
export function PrototypeDisclaimer({ compact = false }: { compact?: boolean }) {
  return (
    <div className="mx-4 my-2 flex items-start gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-[11px] leading-snug text-muted-foreground">
      <ShieldAlert className="size-3.5 mt-0.5 shrink-0 text-primary" />
      <p>
        <span className="font-semibold text-foreground">Prototype.</span>{" "}
        {compact
          ? "Simulated wallet — no real money or payments."
          : "Hackathon demo only. All balances, top-ups, debts and PayLater transactions are simulated. No real money moves and no real bank/payment data is stored."}
      </p>
    </div>
  );
}
