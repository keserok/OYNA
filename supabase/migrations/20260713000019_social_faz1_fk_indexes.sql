-- ================================================================
-- SOSYAL AŞAMA 1.19 — Kapanış: FK kapsayıcı indeksleri
-- Performans advisor'ının sosyal tablolarda işaretlediği 10 indekssiz
-- yabancı anahtar kapatılır (JOIN + ON DELETE CASCADE maliyetleri).
-- unused_index INFO'ları beklenen durumdur (özellik yeni, trafik yok).
-- ================================================================

CREATE INDEX IF NOT EXISTS idx_fk_match_list_invites_inviter
  ON public.match_list_invites (inviter_id);
CREATE INDEX IF NOT EXISTS idx_fk_match_list_invites_list
  ON public.match_list_invites (list_id);

CREATE INDEX IF NOT EXISTS idx_fk_match_tactics_assigned_by
  ON public.match_tactics (assigned_by);
CREATE INDEX IF NOT EXISTS idx_fk_match_tactics_tactic
  ON public.match_tactics (tactic_id);
CREATE INDEX IF NOT EXISTS idx_fk_match_tactics_team
  ON public.match_tactics (team_id);

CREATE INDEX IF NOT EXISTS idx_fk_team_chat_reads_user
  ON public.team_chat_reads (user_id);

CREATE INDEX IF NOT EXISTS idx_fk_team_invite_links_created_by
  ON public.team_invite_links (created_by);

CREATE INDEX IF NOT EXISTS idx_fk_team_invites_inviter
  ON public.team_invites (inviter_id);

CREATE INDEX IF NOT EXISTS idx_fk_team_join_requests_responded_by
  ON public.team_join_requests (responded_by);

CREATE INDEX IF NOT EXISTS idx_fk_team_messages_sender
  ON public.team_messages (sender_id);
