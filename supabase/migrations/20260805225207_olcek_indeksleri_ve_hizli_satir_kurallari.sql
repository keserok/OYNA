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
-- ⚠️ HENÜZ DOĞMAMIŞ TABLO SORUNU (sıfırdan kurulum)
-- Bu dosya canlıda çalıştığında aşağıdaki tabloların hepsi mevcuttu. Depoda
-- ise bir kısmı DAHA SONRAKİ migration'larda yaratılıyor (ör.
-- `match_tactic_proposals` → 20260826000001); sıfırdan kurulan bir
-- veritabanında düz `CREATE INDEX` "relation does not exist" deyip kurulumu
-- çökertiyordu. (Bu benim önceki turda eklediğim dosyaydı; sıralama
-- gözden kaçmıştı.)
--
-- İndeks yalnız HIZ içindir; olmayan tabloyu atlamak hiçbir kuralı zayıflatmaz.
-- Tablo sonradan doğduğunda indeks de kendi migration'ında kurulur.
DO $indeksler$
DECLARE
  r record;
  v_kurulan int := 0; v_atlanan int := 0;
  v_liste constant text[][] := ARRAY[
    ['home_banners_updated_by_idx',            'public.home_banners',            'updated_by'],
    ['istemci_hatalari_kullanici_id_idx',      'public.istemci_hatalari',        'kullanici_id'],
    ['match_tactic_proposals_proposer_id_idx', 'public.match_tactic_proposals',  'proposer_id'],
    ['match_tactic_proposals_tactic_id_idx',   'public.match_tactic_proposals',  'tactic_id'],
    ['owner_client_ops_created_by_idx',        'public.owner_client_ops',        'created_by'],
    ['pitch_debtor_entries_pitch_id_idx',      'public.pitch_debtor_entries',    'pitch_id'],
    ['pitch_expense_templates_pitch_id_idx',   'public.pitch_expense_templates', 'pitch_id'],
    ['pitch_staff_members_created_by_idx',     'public.pitch_staff_members',     'created_by'],
    ['pitches_payment_mode_updated_by_idx',    'public.pitches',                 'payment_mode_updated_by'],
    ['profiles_guardian_user_id_idx',          'public.profiles',                'guardian_user_id'],
    ['region_coverage_updated_by_idx',         'public.region_coverage',         'updated_by'],
    ['urun_olaylari_kullanici_id_idx',         'public.urun_olaylari',           'kullanici_id'],
    ['urun_olaylari_olay_idx',                 'public.urun_olaylari',           'olay']
  ];
BEGIN
  FOR i IN 1 .. array_length(v_liste, 1) LOOP
    -- Tablo var mı? Sütun var mı? İkisi de yoksa sessizce atla.
    IF to_regclass(v_liste[i][2]) IS NULL THEN
      v_atlanan := v_atlanan + 1;
      CONTINUE;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_attribute a
      WHERE a.attrelid = to_regclass(v_liste[i][2])
        AND a.attname = v_liste[i][3] AND a.attnum > 0 AND NOT a.attisdropped
    ) THEN
      v_atlanan := v_atlanan + 1;
      CONTINUE;
    END IF;

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s (%I)',
                   v_liste[i][1], v_liste[i][2], v_liste[i][3]);
    v_kurulan := v_kurulan + 1;
  END LOOP;
  RAISE NOTICE '[OLCEK] % indeks kuruldu, % tablo/sutun henuz yok (atlandi).',
               v_kurulan, v_atlanan;
END $indeksler$;

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
-- Tablo depoda DAHA SONRA yaratılıyor (20260826000001); sıfırdan kurulumda
-- burada henüz yok. Kural o tablonun kendi migration'ında zaten kuruluyor;
-- burada yapılan yalnız HIZLANDIRMA (auth.uid() -> (SELECT auth.uid())).
-- Tablo yoksa atlanır; anlam değişmez.
DO $mtp$
BEGIN
  IF to_regclass('public.match_tactic_proposals') IS NULL THEN
    RAISE NOTICE '[OLCEK] match_tactic_proposals henuz yok - kural hizlandirmasi atlandi.';
    RETURN;
  END IF;

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
END $mtp$;
