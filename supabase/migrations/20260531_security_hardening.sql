-- ==============================================================================
-- OYNA: Security Hardening Migration
-- ==============================================================================

-- 1. Profiles Tablosundaki Hassas Sütunları Koruma Tetikleyicisi (Privilege Escalation Koruması)
-- Bu tetikleyici, admin olmayan bir kullanıcının kendi yetkisini (role), bakiyesini (wallet_balance),
-- doğrulama durumunu (is_verified) veya puanlarını değiştirmesini engeller.
CREATE OR REPLACE FUNCTION protect_profile_sensitive_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- Eğer güncelleyen kullanıcı admin değilse (veya sistem tarafından yapılmıyorsa) kontrol et
  IF (SELECT role FROM public.profiles WHERE id = auth.uid()) <> 'ADMIN' OR auth.uid() IS NULL THEN
    IF NEW.role <> OLD.role OR
       NEW.wallet_balance <> OLD.wallet_balance OR
       NEW.is_verified <> OLD.is_verified OR
       NEW.is_banned <> OLD.is_banned OR
       NEW.trust_score <> OLD.trust_score OR
       NEW.skill_rating <> OLD.skill_rating THEN
      RAISE EXCEPTION 'UNAUTHORIZED_COLUMN_CHANGE: Rol, cüzdan bakiyesi, ban durumu ve puanlar sadece yöneticiler (Admin) veya sistem tarafından güncellenebilir.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_profile_sensitive_fields ON public.profiles;
CREATE TRIGGER trg_protect_profile_sensitive_fields
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION protect_profile_sensitive_fields();


-- 2. Cüzdan ve Konum RPC Fonksiyonlarında Yetki Kontrolleri
-- process_match_payment, process_match_refund ve update_user_location RPC'lerini çağıran kişinin,
-- hedef p_user_id ile aynı kişi (veya admin) olduğunu doğrular.

-- process_match_payment RPC (Güvenli Sürüm)
CREATE OR REPLACE FUNCTION process_match_payment(
  p_user_id UUID, 
  p_match_id UUID, 
  p_amount NUMERIC
) 
RETURNS BOOLEAN AS $$
DECLARE
  v_current_balance NUMERIC;
BEGIN
  -- YETKİ KONTROLÜ
  IF auth.uid() <> p_user_id AND (SELECT role FROM public.profiles WHERE id = auth.uid()) <> 'ADMIN' THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Başka bir kullanıcının cüzdanından ödeme yapamazsınız.';
  END IF;

  -- Satır kilidi ile bakiye al
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

  -- Logla
  INSERT INTO public.wallet_transactions (user_id, match_id, amount, type, description)
  VALUES (p_user_id, p_match_id, -p_amount, 'MATCH_FEE', 'Maç katılım ücreti');

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- process_match_refund RPC (Güvenli Sürüm)
CREATE OR REPLACE FUNCTION process_match_refund(
  p_user_id UUID, 
  p_match_id UUID, 
  p_amount NUMERIC
) 
RETURNS BOOLEAN AS $$
BEGIN
  -- YETKİ KONTROLÜ
  IF auth.uid() <> p_user_id AND (SELECT role FROM public.profiles WHERE id = auth.uid()) <> 'ADMIN' THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Başka bir kullanıcının cüzdanına iade yapamazsınız.';
  END IF;

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


-- update_user_location RPC (Güvenli Sürüm)
CREATE OR REPLACE FUNCTION update_user_location(
  p_user_id UUID,
  p_point_str TEXT
)
RETURNS VOID AS $$
BEGIN
  -- YETKİ KONTROLÜ
  IF auth.uid() <> p_user_id AND (SELECT role FROM public.profiles WHERE id = auth.uid()) <> 'ADMIN' THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Başka bir kullanıcının konumunu güncelleyemezsiniz.';
  END IF;

  UPDATE public.profiles
  SET last_location = ST_GeomFromText(p_point_str, 4326)
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. Korumasız Tablolar İçin Row Level Security (RLS) Etkinleştirme
-- matches, teams ve settings tablolarını tamamen korumasız durumdan çıkarıyoruz.

-- MATCHES tablosu RLS
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Matches are viewable by everyone" ON public.matches;
CREATE POLICY "Matches are viewable by everyone" ON public.matches 
FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can create matches" ON public.matches;
CREATE POLICY "Authenticated users can create matches" ON public.matches 
FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Creators or Admins can update matches" ON public.matches;
CREATE POLICY "Creators or Admins can update matches" ON public.matches 
FOR UPDATE USING (
  auth.uid() = captain_id OR 
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'ADMIN'
);

DROP POLICY IF EXISTS "Creators or Admins can delete matches" ON public.matches;
CREATE POLICY "Creators or Admins can delete matches" ON public.matches 
FOR DELETE USING (
  auth.uid() = captain_id OR 
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'ADMIN'
);


-- TEAMS tablosu RLS
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Teams are viewable by everyone" ON public.teams;
CREATE POLICY "Teams are viewable by everyone" ON public.teams 
FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can create teams" ON public.teams;
CREATE POLICY "Authenticated users can create teams" ON public.teams 
FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Captains or Admins can update teams" ON public.teams;
CREATE POLICY "Captains or Admins can update teams" ON public.teams 
FOR UPDATE USING (
  auth.uid() = captain_id OR 
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'ADMIN'
);

DROP POLICY IF EXISTS "Captains or Admins can delete teams" ON public.teams;
CREATE POLICY "Captains or Admins can delete teams" ON public.teams 
FOR DELETE USING (
  auth.uid() = captain_id OR 
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'ADMIN'
);


-- SETTINGS tablosu RLS
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Settings are viewable by everyone" ON public.settings;
CREATE POLICY "Settings are viewable by everyone" ON public.settings 
FOR SELECT USING (true);

DROP POLICY IF EXISTS "Only Admins can update settings" ON public.settings;
CREATE POLICY "Only Admins can update settings" ON public.settings 
FOR ALL USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'ADMIN'
);


-- 4. Kaleci ve Hakem Profillerinde Kendini "Elite" Yapma veya Rating Değiştirme Engelleyici Tetikleyicisi
CREATE OR REPLACE FUNCTION protect_provider_sensitive_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT role FROM public.profiles WHERE id = auth.uid()) <> 'ADMIN' OR auth.uid() IS NULL THEN
    IF NEW.is_elite <> OLD.is_elite OR NEW.rating <> OLD.rating THEN
      RAISE EXCEPTION 'UNAUTHORIZED: Elite statüsü ve rating sadece yöneticiler (Admin) tarafından güncellenebilir.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_gk_fields ON public.goalkeepers;
CREATE TRIGGER trg_protect_gk_fields
BEFORE UPDATE ON public.goalkeepers
FOR EACH ROW EXECUTE FUNCTION protect_provider_sensitive_fields();

DROP TRIGGER IF EXISTS trg_protect_ref_fields ON public.referees;
CREATE TRIGGER trg_protect_ref_fields
BEFORE UPDATE ON public.referees
FOR EACH ROW EXECUTE FUNCTION protect_provider_sensitive_fields();
