// ════════════════════════════════════════════════════════════════════════════
// KÖPRÜ PAKETİ (1+2+5) — kurucu kararlarının bekçisi (9 Ağustos 2026)
// Önizleme oyuncuyla AYNI veri yolundan · vitrin skoru standart 5 ölçüt ·
// haftalık özet gece işi + bildirim.
// ════════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { vitrinSkoru } from '../../shared/vitrinSkoru';

const oku = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('vitrinSkoru — standart 5 ölçüt', () => {
  const tam = { photoCount: 3, hasDescription: true, courtCount: 2, courtsWithoutTariff: 0, hasWorkingHours: true, hasCancellationPolicy: true };

  it('her şey tamamsa 5/5', () => {
    const s = vitrinSkoru(tam);
    expect(s.puan).toBe(5);
    expect(s.olcutler).toHaveLength(5);
  });

  it('2 fotoğraf yetmez — en az 3 (kurucu kararı)', () => {
    const s = vitrinSkoru({ ...tam, photoCount: 2 });
    expect(s.puan).toBe(4);
    expect(s.olcutler.find((o) => o.key === 'photos')?.done).toBe(false);
  });

  it('hiç kort yoksa tarife ölçütü DOLU sayılmaz', () => {
    const s = vitrinSkoru({ ...tam, courtCount: 0 });
    expect(s.olcutler.find((o) => o.key === 'tariffs')?.done).toBe(false);
  });

  it('boş her şey → 0/5', () => {
    expect(vitrinSkoru({ photoCount: 0, hasDescription: false, courtCount: 0, courtsWithoutTariff: 0, hasWorkingHours: false, hasCancellationPolicy: false }).puan).toBe(0);
  });
});

describe('ekran ve veri bağları', () => {
  const panel = oku('views/OwnerPanel.tsx');
  const menu = oku('views/owner/menu/OwnerMenuView.tsx');
  const servis = oku('services/pitchOwnerService.ts');
  const migration = oku('supabase/migrations/20260907000000_haftalik_ozet.sql');

  it('önizleme oyuncuyla AYNI seçki ve eşlemeyi kullanır', () => {
    expect(servis).toContain('PITCH_SHOWCASE_SELECT');
    expect(servis).toContain('mapDbPitchToUiPitch');
    expect(oku('views/owner/menu/OwnerShowcasePreviewModal.tsx')).toContain('getPitchShowcase');
  });

  it('menüde Vitrin Önizleme satırı + üst kartta vitrin hapı var', () => {
    expect(menu).toContain('Vitrin Önizleme');
    expect(menu).toContain('Vitrin ${vitrinPuan}/5');
  });

  it('ana ekranda haftalık özet kartı ve skorlu kurulum başlığı var', () => {
    expect(panel).toContain('OwnerWeeklySummaryCard');
    expect(panel).toContain('Vitrin puanın: ${vitrin.puan}');
  });

  it('haftalık özet migration: tablo + RLS + cron + bildirim + doğrulama', () => {
    expect(migration).toContain('owner_weekly_summaries');
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain("cron.schedule('haftalik_ozet', '0 3 * * 1'");
    expect(migration).toContain('owner_weekly_summary');
    expect(migration).toContain('DOGRULAMA');
    // Boş haftada bildirim spam'i yok:
    expect(migration).toContain('v_rez > 0 OR v_tah > 0');
  });
});
