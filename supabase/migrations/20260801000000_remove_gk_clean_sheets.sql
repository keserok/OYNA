-- ============================================================================
-- cleanSheets (gol yemeden tamamlanan maç) istatistiğini KALDIR
-- ----------------------------------------------------------------------------
-- Bu istatistik tüm kullanıcı ekranlarından (Marketplace "Kaleci Bul" detayı,
-- sağlayıcının kendi ServiceProfile kartı) ve admin panelinden (DeepEditModals,
-- AddUserModal) kaldırıldı. Kaleci stats JSONB'sinde artık gösterilmediği için
-- mevcut satırlardan da temizlenir.
--
-- stats blob'u passthrough saklandığından (admin_*_goalkeeper / provider RPC'leri
-- alan-alan değil) yalnızca anahtarı düşürmek yeterli; şema/RPC değişmez.
-- Idempotent: anahtar yoksa satır etkilenmez. Yeniden çalıştırılabilir.
-- ============================================================================

UPDATE public.goalkeepers
SET stats = stats - 'cleanSheets'
WHERE stats ? 'cleanSheets';

-- Not: referees.stats zaten cleanSheets içermiyor (kaleciye özgü metrikti).
