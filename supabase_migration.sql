-- 1. teams tablosuna team_roles JSONB kolonunu ekle
-- Bu kolon, oyuncuların taktiksel koordinatlarını (x, y) ve bireysel talimatlarını tutar.
ALTER TABLE public.teams 
ADD COLUMN IF NOT EXISTS team_roles JSONB DEFAULT '{}'::jsonb;

-- 2. Kadrodan çıkarma işlemini yapan sbRemovePlayerFromTeam RPC fonksiyonunu oluştur
-- Hem team_members tablosundan satırı siler hem de işlem sonucunu döner.
CREATE OR REPLACE FUNCTION public.sbremoveplayerfromteam(
    p_team_id TEXT, 
    p_player_id TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    deleted_rows INT;
BEGIN
    -- team_members tablosundan oyuncuyu ve takımı eşleştirerek sil
    DELETE FROM public.team_members 
    WHERE team_id = p_team_id AND player_id = p_player_id;
    
    GET DIAGNOSTICS deleted_rows = ROW_COUNT;
    
    -- Eğer en az 1 satır silindiyse true, silinmediyse false döner
    RETURN deleted_rows > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Gerekli izinleri ata (tüm kullanıcılar erişebilir)
GRANT EXECUTE ON FUNCTION public.sbremoveplayerfromteam(TEXT, TEXT) TO anon, authenticated, service_role;
