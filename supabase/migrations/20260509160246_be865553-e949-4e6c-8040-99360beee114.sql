-- Dedicated history tables for food budget and Smart Vault actions.

CREATE TABLE IF NOT EXISTS public.food_budget (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  week_start date NOT NULL,
  budget numeric NOT NULL DEFAULT 0,
  spent numeric NOT NULL DEFAULT 0,
  meal text,
  cost numeric,
  kind text NOT NULL DEFAULT 'purchase', -- 'budget_set' | 'purchase'
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.food_budget ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own food_budget all" ON public.food_budget
  FOR ALL TO public
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS food_budget_user_idx ON public.food_budget (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.vault_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action text NOT NULL, -- 'lock' | 'unlock' | 'reward' | 'streak_tick'
  amount numeric NOT NULL DEFAULT 0,
  vault_balance_after numeric NOT NULL DEFAULT 0,
  wallet_balance_after numeric NOT NULL DEFAULT 0,
  streak_after integer NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vault_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own vault_logs all" ON public.vault_logs
  FOR ALL TO public
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS vault_logs_user_idx ON public.vault_logs (user_id, created_at DESC);
