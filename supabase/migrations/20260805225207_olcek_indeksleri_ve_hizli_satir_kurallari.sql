-- ════════════════════════════════════════════════════════════════════════════
-- ÖLÇEK HAZIRLIĞI — eksik indeksler + yavaş satır kuralları
-- ════════════════════════════════════════════════════════════════════════════
--
-- Supabase performans denetimi (advisors) iki GERÇEK sorun buldu. İkisi de
-- bugün görünmez çünkü veri az; ikisi de veri büyüyünce hissedilir.
--
-- ── 1) İNDEKSSİZ BAĞLANTI KOLONLARI (13 adet) ─────────────────────────────
-- Bir tablo başka bir tabloya "bağlıysa" (yabancı anahtar), o bağlantı
-- kolonunda indeks yoksa veritabanı her sorguda TABLONUN TAMAMINI tarar.
-- 100 satırda fark edilmez, 100.000 satırda ekran donar.
-- Ayrıca: bağlanılan kayıt silinirken de tam tarama yapılır.
--
-- Hepsi CONCURRENTLY DEĞİL, normal CREATE INDEX IF NOT EXISTS ile eklenir:
-- tablolar bugün küçük, kilit süresi milisaniye. (CONCURRENTLY migration
-- işlemi içinde çalışamaz.)
--
-- ── 2) SATIR KURALINDA TEKRAR TEKRAR KİMLİK SORMA (4 adet) ────────────────
-- `auth.uid()` bir satır kuralında çıplak yazılırsa PostgreSQL onu HER SATIR
-- İÇİN yeniden hesaplar. `(SELECT auth.uid())` yazılırsa BİR KEZ hesaplayıp
-- sonucu kullanır. Anlamı birebir aynıdır, yalnız hızlıdır.
-- Depodaki diğer kuralların çoğu zaten doğru biçimde yazılmış; bunlar
-- gözden kaçmış 4 tanesi.
--
-- ANLAMSAL DEĞİŞİKLİK YOKTUR: kimin neyi görebileceği AYNI kalır. Yalnızca
-- aynı sonuca daha hızlı varılır.
--
-- GERİ ALMA: indeksler DROP INDEX ile; politikalar için bu dosyadaki
-- tanımların `(SELECT auth.uid())` yerine `auth.uid()` hâli.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) EKSİK İNDEKSLER ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS home_banners_updated_by_idx            ON public.home_banners (updated_by);
CREATE INDEX IF NOT EXISTS istemci_hatalari_kullanici_id_idx      ON public.istemci_hatalari (kullanici_id);
CREATE INDEX IF NOT EXISTS match_tactic_proposals_proposer_id_idx ON public.match_tactic_proposals (proposer_id);
CREATE INDEX IF NOT EXISTS match_tactic_proposals_tactic_id_idx   ON public.match_tactic_proposals (tactic_id);
CREATE INDEX IF NOT EXISTS owner_client_ops_created_by_idx        ON public.owner_client_ops (created_by);
CREATE INDEX IF NOT EXISTS pitch_debtor_entries_pitch_id_idx      ON public.pitch_debtor_entries (pitch_id);
CREATE INDEX IF NOT EXISTS pitch_expense_templates_pitch_id_idx   ON public.pitch_expense_templates (pitch_id);
CREATE INDEX IF NOT EXISTS pitch_staff_members_created_by_idx     ON public.pitch_staff_members (created_by);
CREATE INDEX IF NOT EXISTS pitches_payment_mode_updated_by_idx    ON public.pitches (payment_mode_updated_by);
CREATE INDEX IF NOT EXISTS profiles_guardian_user_id_idx          ON public.profiles (guardian_user_id);
CREATE INDEX IF NOT EXISTS region_coverage_updated_by_idx         ON public.region_coverage (updated_by);
CREATE INDEX IF NOT EXISTS urun_olaylari_kullanici_id_idx         ON public.urun_olaylari (kullanici_id);
CREATE INDEX IF NOT EXISTS urun_olaylari_olay_idx                 ON public.urun_olaylari (olay);

-- ── 2) SATIR KURALLARI HIZLANDIRILDI (anlam AYNI) ──────────────────────────

-- support_tickets: kullanıcı yalnız kendi destek talebini görür.
DROP POLICY IF EXISTS support_tickets_owner_select ON public.support_tickets;
CREATE POLICY support_tickets_owner_select ON public.support_tickets
  FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

-- support_ticket_messages: kullanıcı yalnız KENDİ talebinin mesajlarını görür.
DROP POLICY IF EXISTS support_ticket_messages_owner_select ON public.support_ticket_messages;
CREATE POLICY support_ticket_messages_owner_select ON public.support_ticket_messages
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.support_tickets t
     WHERE t.id = support_ticket_messages.ticket_id
       AND t.user_id = (SELECT auth.uid())));

-- pitch_demand_signals: yönetici hepsini, kullanıcı yalnız kendi sinyalini görür.
DROP POLICY IF EXISTS pitch_demand_read ON public.pitch_demand_signals;
CREATE POLICY pitch_demand_read ON public.pitch_demand_signals
  FOR SELECT
  USING (public.is_admin() OR (user_id IS NOT NULL AND user_id = (SELECT auth.uid())));

-- match_tactic_proposals: maçın katılımcısı ya da kurucusu görür.
DROP POLICY IF EXISTS mtp_select ON public.match_tactic_proposals;
CREATE POLICY mtp_select ON public.match_tactic_proposals
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.match_participants mp
             WHERE mp.match_id = match_tactic_proposals.match_id
               AND mp.user_id = (SELECT auth.uid()))
    OR
    EXISTS (SELECT 1 FROM public.matches m
             WHERE m.id = match_tactic_proposals.match_id
               AND m."creatorId" = (SELECT auth.uid())));
