import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowDownLeft, ArrowUpRight, QrCode, Plus, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { calcVaultLock, fetchProfile, logTransaction, pushNotification, updateProfile } from "@/lib/profile";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";

export const Route = createFileRoute("/app/wallet")({ component: WalletPage });

type Tx = { id: string; type: string; amount: number; description: string | null; created_at: string };

function WalletPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [sheet, setSheet] = useState<null | "topup" | "send" | "receive">(null);

  const { data: p } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: () => fetchProfile(user!.id),
    enabled: !!user,
  });

  const { data: txs } = useQuery({
    queryKey: ["txs", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("transactions").select("*")
        .eq("user_id", user!.id).order("created_at", { ascending: false }).limit(20);
      return (data ?? []) as Tx[];
    },
    enabled: !!user,
  });

  if (!p) return null;

  async function topup(amount: number) {
    if (!user || !p) return;
    const lock = calcVaultLock(amount);
    const toWallet = amount - lock;
    await updateProfile(user.id, {
      wallet_balance: p.wallet_balance + toWallet,
      vault_balance: p.vault_balance + lock,
    });
    await logTransaction(user.id, "topup", amount, `Top up RM ${amount.toFixed(2)}`, "wallet");
    if (lock > 0) {
      await logTransaction(user.id, "vault_lock", lock, `Auto-locked 20% to Smart Vault`, "vault");
      await pushNotification(user.id, "Smart Vault locked 🔒", `RM ${lock.toFixed(2)} (20%) auto-locked from your top-up. Discipline.`, "info");
      toast.success(`Top-up RM ${toWallet.toFixed(2)} — RM ${lock.toFixed(2)} locked in Vault`);
    } else {
      toast.success(`Top up RM ${amount.toFixed(2)} added`);
    }
    qc.invalidateQueries({ queryKey: ["profile", user.id] });
    qc.invalidateQueries({ queryKey: ["txs", user.id] });
    setSheet(null);
  }

  async function send(to: string, amount: number) {
    if (!user || !p) return;
    if (amount > p.wallet_balance) { toast.error("Insufficient wallet balance"); return; }
    await updateProfile(user.id, { wallet_balance: p.wallet_balance - amount });
    await logTransaction(user.id, "send", -amount, `Sent to ${to}`, "transfer");
    qc.invalidateQueries({ queryKey: ["profile", user.id] });
    qc.invalidateQueries({ queryKey: ["txs", user.id] });
    toast.success(`Sent RM ${amount.toFixed(2)}`);
    setSheet(null);
  }

  return (
    <div className="animate-float-up">
      <Header title="Wallet" subtitle="Send, receive, top up" />
      <section className="px-5">
        <div className="glass rounded-3xl p-5">
          <p className="text-xs text-muted-foreground">Wallet balance</p>
          <p className="text-3xl font-bold gold-text mt-1">RM {p.wallet_balance.toFixed(2)}</p>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <ActionBtn icon={<Plus className="size-4" />} label="Top up" onClick={() => setSheet("topup")} primary />
            <ActionBtn icon={<ArrowUpRight className="size-4" />} label="Send" onClick={() => setSheet("send")} />
            <ActionBtn icon={<ArrowDownLeft className="size-4" />} label="Receive" onClick={() => setSheet("receive")} />
          </div>
        </div>
      </section>

      <section className="px-5 mt-5">
        <h2 className="text-sm font-semibold mb-3">Recent transactions</h2>
        <div className="glass rounded-2xl divide-y divide-border/40">
          {(txs ?? []).length === 0 && <p className="p-4 text-sm text-muted-foreground text-center">No transactions yet</p>}
          {(txs ?? []).map((t) => (
            <div key={t.id} className="flex items-center gap-3 p-3.5">
              <div className={`size-9 rounded-xl flex items-center justify-center ${t.amount >= 0 ? "navy-bg" : "bg-destructive/15"}`}>
                {t.amount >= 0 ? <ArrowDownLeft className="size-4 text-primary" /> : <ArrowUpRight className="size-4 text-destructive" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{t.description ?? t.type}</p>
                <p className="text-[11px] text-muted-foreground">{new Date(t.created_at).toLocaleString("en-MY")}</p>
              </div>
              <p className={`text-sm font-semibold ${t.amount >= 0 ? "text-success" : "text-destructive"}`}>
                {t.amount >= 0 ? "+" : ""}RM {Math.abs(t.amount).toFixed(2)}
              </p>
            </div>
          ))}
        </div>
      </section>

      {sheet && (
        <Sheet onClose={() => setSheet(null)}>
          {sheet === "topup" && <TopUpForm onSubmit={topup} />}
          {sheet === "send" && <SendForm onSubmit={send} />}
          {sheet === "receive" && <ReceiveQR userId={user?.id ?? ""} />}
        </Sheet>
      )}
    </div>
  );
}

function ActionBtn({ icon, label, onClick, primary }: { icon: React.ReactNode; label: string; onClick: () => void; primary?: boolean }) {
  return (
    <button onClick={onClick}
      className={`flex flex-col items-center gap-1.5 py-3 rounded-xl text-xs font-medium transition-all ${primary ? "gold-bg glow-gold" : "navy-bg text-foreground"}`}>
      {icon}{label}
    </button>
  );
}

function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="w-full md:max-w-[420px] bg-card rounded-t-3xl p-6 pb-8 animate-float-up border-t border-border">
        <div className="flex justify-between items-center mb-4">
          <div className="size-10" />
          <div className="h-1 w-10 rounded-full bg-muted" />
          <button onClick={onClose} className="size-10 rounded-full glass flex items-center justify-center"><X className="size-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function TopUpForm({ onSubmit }: { onSubmit: (n: number) => void }) {
  const [amt, setAmt] = useState("");
  const lock = calcVaultLock(parseFloat(amt) || 0);
  return (
    <div>
      <h3 className="text-xl font-bold">Top up wallet</h3>
      <p className="text-sm text-muted-foreground mt-1">Top-ups ≥ RM 200 auto-lock 20% to your Smart Vault.</p>
      <input type="number" autoFocus value={amt} onChange={(e) => setAmt(e.target.value)}
        placeholder="0.00"
        className="mt-5 w-full bg-input rounded-xl px-4 py-3.5 outline-none text-2xl font-semibold gold-text" />
      <div className="mt-3 flex gap-2">
        {[50, 100, 200, 500].map((v) => (
          <button key={v} onClick={() => setAmt(String(v))} className="flex-1 py-2 rounded-lg navy-bg text-sm">RM {v}</button>
        ))}
      </div>
      {lock > 0 && (
        <p className="mt-4 text-xs text-primary">🔒 RM {lock.toFixed(2)} will be locked in your Smart Vault.</p>
      )}
      <button onClick={() => { const n = parseFloat(amt); if (n > 0) onSubmit(n); else toast.error("Enter an amount"); }}
        className="mt-5 w-full gold-bg glow-gold py-3.5 rounded-xl font-semibold">Confirm top-up</button>
    </div>
  );
}

function SendForm({ onSubmit }: { onSubmit: (to: string, n: number) => void }) {
  const [to, setTo] = useState(""); const [amt, setAmt] = useState("");
  return (
    <div>
      <h3 className="text-xl font-bold">Send money</h3>
      <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="Recipient name or ID"
        className="mt-5 w-full bg-input rounded-xl px-4 py-3.5 outline-none" />
      <input type="number" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="Amount (RM)"
        className="mt-3 w-full bg-input rounded-xl px-4 py-3.5 outline-none text-xl font-semibold gold-text" />
      <button onClick={() => { const n = parseFloat(amt); if (!to || !(n > 0)) { toast.error("Fill in details"); return; } onSubmit(to, n); }}
        className="mt-5 w-full gold-bg glow-gold py-3.5 rounded-xl font-semibold">Send</button>
    </div>
  );
}

function ReceiveQR({ userId }: { userId: string }) {
  const code = userId.slice(0, 8).toUpperCase();
  return (
    <div className="text-center">
      <h3 className="text-xl font-bold">Receive money</h3>
      <p className="text-sm text-muted-foreground mt-1">Show this code to the sender.</p>
      <div className="mt-5 mx-auto size-56 bg-foreground rounded-2xl p-4 flex items-center justify-center">
        <QRPattern seed={code} />
      </div>
      <p className="mt-4 text-lg font-bold tracking-widest gold-text">@{code}</p>
      <div className="mt-5 flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <QrCode className="size-3.5" /> Simulated QR — for demo
      </div>
    </div>
  );
}

function QRPattern({ seed }: { seed: string }) {
  // Deterministic pseudo-QR pattern
  const size = 17;
  const cells: boolean[] = [];
  let h = 0; for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  for (let i = 0; i < size * size; i++) {
    h = (h * 1103515245 + 12345) >>> 0;
    cells.push((h & 1) === 1);
  }
  // Force corners
  const setBlock = (cx: number, cy: number) => {
    for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
      const idx = (cy + y) * size + (cx + x);
      const border = x === 0 || y === 0 || x === 6 || y === 6;
      const inner = x >= 2 && x <= 4 && y >= 2 && y <= 4;
      cells[idx] = border || inner;
    }
  };
  setBlock(0, 0); setBlock(size - 7, 0); setBlock(0, size - 7);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full">
      {cells.map((on, i) => on && <rect key={i} x={i % size} y={Math.floor(i / size)} width="1" height="1" fill="black" />)}
    </svg>
  );
}
