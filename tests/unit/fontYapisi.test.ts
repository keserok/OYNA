import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

// ═══════════════════════════════════════════════════════════════════════════
// YAZI YAPISI TEK — karar kilidi (kurucu kararı, 20 Ağustos 2026)
//
//   "Tüm uygulamanın font yapısını ana ekranla aynı yap; ana ekrandaki
//    fontları tüm ekranlara, yazılara uygula."
//
// BULUNAN HATA: Tailwind v4 preflight gövde fontunu
// `var(--default-font-family, ui-sans-serif, …)` diye çözer ve bu değişken
// tanımlı değildi — ana ekran satır içi stille Inter çizerken diğer bütün
// ekranlar sistem fontuna düşüyordu. Bu dosya üç kuralı kilitler; biri
// silinirse ekranlar sessizce yeniden ayrışır.
// ═══════════════════════════════════════════════════════════════════════════

const css = readFileSync(path.resolve(__dirname, '../../index.css'), 'utf-8');

describe('yazı yapısı ana ekranla aynı', () => {
  it('varsayılan aile tanımlı: --default-font-family = var(--font-sans)', () => {
    expect(css).toMatch(/--default-font-family:\s*var\(--font-sans\)/);
  });

  it('başlık sesi eşlenmiş: font-extrabold.italic → display ailesi', () => {
    expect(css).toMatch(/#root \.font-extrabold\.italic[\s\S]{0,120}font-family:\s*var\(--font-display\)/);
  });

  it('rakam sesi ana ekranla aynı: .font-numeric ayrı aile açmaz', () => {
    const blok = css.slice(css.indexOf('.font-numeric'));
    const govde = blok.slice(0, blok.indexOf('}'));
    expect(govde).toContain('font-family: var(--font-sans)');
    expect(govde).toContain('tabular-nums');
    expect(govde).not.toContain('Space Grotesk');
  });
});
