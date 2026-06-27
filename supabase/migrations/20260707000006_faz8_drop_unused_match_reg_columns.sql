-- FAZ 8 (oyuncu) düzeltme: çoklu-slot/atama tek kaynağı matches.slots (jsonb).
-- 20260707000003'te eklenen ama RPC'lerce kullanılmayan kolonlar kaldırılır
-- (ölü kod sadeleştirme; bağlı index/constraint otomatik düşer).
alter table public.match_registrations
  drop column if exists purchased_by,
  drop column if exists occupant,
  drop column if exists assignment_status,
  drop column if exists invitee_id,
  drop column if exists claim_code;
