-- OYNA APP CÜZDAN VE BÜTÇE SİSTEMİ EKLENTİSİ
-- Lütfen bu kodu Supabase SQL Editor'de çalıştırın.

-- 1. Wallet Transactions Log Tablosu
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  match_id UUID REFERENCES public.matches(id),
  amount NUMERIC NOT NULL, -- Eksi değer (ödeme) veya artı değer (iade/bakiye yükleme)
  type TEXT NOT NULL, -- 'MATCH_FEE', 'REFUND', 'DEPOSIT', 'WITHDRAWAL'
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. Maça Katılma ve Ödeme Kesme RPC'si (Race-condition Korumalı)
-- Bu fonksiyon bakiye kontrolü yapar, ödemeyi keser ve log atar.
CREATE OR REPLACE FUNCTION process_match_payment(
  p_user_id UUID, 
  p_match_id UUID, 
  p_amount NUMERIC
) 
RETURNS BOOLEAN AS $$
DECLARE
  v_current_balance NUMERIC;
BEGIN
  -- Kullanıcının bakiyesini satır kilidi (FOR UPDATE) ile al ki aynı anda iki maç alınamasın
  SELECT wallet_balance INTO v_current_balance 
  FROM public.profiles 
  WHERE id = p_user_id 
  FOR UPDATE;

  -- Bakiye kontrolü
  IF v_current_balance < p_amount THEN
    RAISE EXCEPTION 'Yetersiz bakiye. Gerekli: % ₺, Mevcut: % ₺', p_amount, v_current_balance;
  END IF;

  -- Bakiyeyi düşür
  UPDATE public.profiles
  SET wallet_balance = wallet_balance - p_amount,
      updated_at = NOW()
  WHERE id = p_user_id;

  -- Transaction logunu yaz
  INSERT INTO public.wallet_transactions (user_id, match_id, amount, type, description)
  VALUES (p_user_id, p_match_id, -p_amount, 'MATCH_FEE', 'Maç katılım ücreti');

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Maçtan Ayrılma ve İade (Refund) RPC'si
CREATE OR REPLACE FUNCTION process_match_refund(
  p_user_id UUID, 
  p_match_id UUID, 
  p_amount NUMERIC
) 
RETURNS BOOLEAN AS $$
BEGIN
  IF p_amount <= 0 THEN
    RETURN TRUE;
  END IF;

  -- Bakiyeyi artır
  UPDATE public.profiles
  SET wallet_balance = wallet_balance + p_amount,
      updated_at = NOW()
  WHERE id = p_user_id;

  -- Logla
  INSERT INTO public.wallet_transactions (user_id, match_id, amount, type, description)
  VALUES (p_user_id, p_match_id, p_amount, 'REFUND', 'Maç iptali / Ayrılma iadesi');

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
