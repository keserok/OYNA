// ════════════════════════════════════════════════════════════════════════════
// MENÜ CİLASI — 8 kurucu kararının bekçisi (docs/master/MENU_CILASI_TASARIMI.md)
// ════════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const menu = readFileSync(join(process.cwd(), 'views/owner/menu/OwnerMenuView.tsx'), 'utf8');

describe('menü cilası — B2B SaaS kararları yerinde', () => {
  it('bölümler iş sıklığına göre: Operasyon → Kurulum → Finans → Uygulama → Hesap', () => {
    const sira = ['>Operasyon<', '>Kurulum<', '>Finans<', '>Uygulama<', '>Hesap<']
      .map((b) => menu.indexOf(b));
    expect(sira.every((i) => i > -1)).toBe(true);
    expect([...sira].sort((a, b) => a - b)).toEqual(sira);
  });

  it('kilitli satırlar gizlenmez — rozet + sade açıklama (karar 4)', () => {
    expect(menu).toContain('locked={!isOwnerLvl}');
    expect(menu).toContain('locked={!isManagerLvl}');
    expect(menu).toContain('Yalnız sahip');
    expect(menu).toContain('kilitliYonetim');
  });

  it('kilitli satır hassas rozeti ÖRTER (bakiye sızmaz)', () => {
    // MenuRow: locked ise badge yerine kilit rozeti çizilir.
    expect(menu).toContain('{locked ? <StatusBadge label={lockedLabel} tone="neutral" /> : badge}');
  });

  it('rozetler hap biçiminde ve ok her satırda duruyor (karar 6)', () => {
    expect(menu).toContain('rounded-full border');
    expect(menu).toContain('<ChevronRight size={16}');
  });

  it('üst kart: yayın hapı + bugünün özeti + kurulum uyarısı (karar 2)', () => {
    expect(menu).toContain("label={stats.isFacilityOpen ? 'Yayında' : 'Kapalı'}");
    expect(menu).toContain('Bugün');
    expect(menu).toContain('saha tarifesiz — fiyat girilmeden');
  });

  it('ölü "Dil" satırı kalktı; Destek satır oldu; Çıkış "Hesap" bloğunda (karar 7)', () => {
    expect(menu).not.toContain('label="Dil"');
    expect(menu).toContain('label="Destek Merkezi"');
    expect(menu).toContain('label="Çıkış Yap"');
    expect(menu).not.toContain('Güvenli Çıkış');
  });

  it('dokunuşta hafif titreşim — desteklenmezse sessiz (karar 8)', () => {
    expect(menu).toContain('navigator.vibrate');
  });
});
