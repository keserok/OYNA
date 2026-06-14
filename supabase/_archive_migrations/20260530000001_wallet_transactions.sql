-- Wallet Transactions Table
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  type TEXT NOT NULL, -- DEPOSIT, WITHDRAWAL, MATCH_EARNING, MATCH_PAYMENT
  status TEXT DEFAULT 'COMPLETED', -- PENDING, COMPLETED, FAILED
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Kullanıcılar kendi işlemlerini görebilir" ON public.wallet_transactions 
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Sistem işlem ekleyebilir" ON public.wallet_transactions 
FOR INSERT WITH CHECK (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE wallet_transactions;
