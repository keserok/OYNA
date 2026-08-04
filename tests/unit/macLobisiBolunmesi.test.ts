/**
 * MAÇ LOBİSİ BÖLÜNMESİ — geri bozulmasın (K-15.1)
 *
 * Kıdemli Yazılım Mühendisi turu (PE-1) şunu ölçmüştü: MatchJoin.tsx 3.240
 * satır, 40 hafıza kutusu, 13 otomatik tepki ve AYNI İŞLEM 14 KEZ tekrar
 * yazılmış. Tekrar birinin tembelliği değildi — dosya o kadar büyüktü ki
 * yazan kişi kopyasını göremiyordu.
 *
 * Kurucu kararı K-15.1: dosya ÜRÜN KAVRAMLARINA göre bölünür (teknik katmana
 * göre DEĞİL). Ölçüt: kurucunun bir cümlesi = tek bir dosya.
 *   K-3.3 / K-1.1  "iade, kaptan para paneli"  → useMacParaBilgisi
 *   K-5.1          "kaleci teminatı"           → useMacSaglayicilari
 *   K-3.4 / K-3.5  "bırakma hakkı, slot devri" → useMacKadrosu
 *
 * Bu dosya o bölünmeyi KORUR: biri veri çekmeyi tekrar ekrana taşırsa ya da
 * tekrar eden yeniden-çekme geri gelirse test kırılır.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const oku = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const ekran = () => oku('views/MatchJoin.tsx');

describe('Maç lobisi ürün kavramlarına göre bölünmüş kalmalı', () => {
  it('üç alan dosyası var ve ekran üçünü de kullanıyor', () => {
    const s = ekran();
    expect(s).toContain("from '../hooks/useMacParaBilgisi'");
    expect(s).toContain("from '../hooks/useMacSaglayicilari'");
    expect(s).toContain("from '../hooks/useMacKadrosu'");
    expect(s).toContain('useMacParaBilgisi(match?.id, showLeaveConfirm)');
    expect(s).toContain('useMacSaglayicilari(match?.id');
    expect(s).toContain('useMacKadrosu(originalMatch?.id');
  });

  it('TEKRAR EDEN yeniden-çekme geri gelmedi (14 → 0)', () => {
    const s = ekran();
    // Eski desen: her aksiyondan sonra elle "çek + uygula" ikilisi.
    expect(s).not.toContain('const fresh = await getMatchDetails(match.id);');
    // Tek tazeleme noktası duruyor mu?
    expect(s).toContain('const macTazele = useCallback(');
  });

  it('veri çekme alan dosyalarında, ekranda DEĞİL', () => {
    const s = ekran();
    // Bu üç çağrı artık kendi alan dosyalarında olmalı.
    expect(s).not.toContain('fetchMatchCancelPolicy(');
    expect(s).not.toContain('previewLeaveMatch(');
    expect(s).not.toContain('getMatchLobbyParticipants(');
    expect(s).not.toContain('getMatchProviders(');
  });

  it('alan dosyaları kendi işini gerçekten yapıyor', () => {
    expect(oku('hooks/useMacParaBilgisi.ts')).toContain('fetchMatchCancelPolicy(macId)');
    expect(oku('hooks/useMacSaglayicilari.ts')).toContain('getMatchProviders(gkId, refId, awayGkId)');
    expect(oku('hooks/useMacKadrosu.ts')).toContain('getMatchLobbyParticipants(macId');
  });

  it('ekranın karmaşıklığı yeniden şişmedi', () => {
    const s = ekran();
    const useState = (s.match(/useState/g) || []).length;
    const useEffect = (s.match(/useEffect\(/g) || []).length;
    // Bölünme öncesi: 40 useState, 13 useEffect. Tavan biraz pay bırakır ki
    // sıradan bir ekran değişikliği testi kırmasın; ama eski hâle dönüş kırar.
    expect(useState).toBeLessThanOrEqual(35);
    expect(useEffect).toBeLessThanOrEqual(9);
  });
});
