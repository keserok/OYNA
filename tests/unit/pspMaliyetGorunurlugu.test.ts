import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

// ═══════════════════════════════════════════════════════════════════════════
// ÖDEME ALTYAPISININ GERÇEK MALİYETİ — karar kilidi (19 Ağustos 2026)
//
// BULGU: kullanıcıdan aldığımız kart işlem bedeli %2,5 sabit (`card_fee_pct`),
// ama iyzico'nun GERÇEKTE kestiği tutar hiçbir yerde saklanmıyordu. Yani
// "eklediğimiz bedel maliyeti karşılıyor mu?" sorusu ölçülemiyordu. Ölçülmeyen
// bir kaçak sessizce büyür: iyzico oranı %3,2'ye çıksa fark her işlemde
// cebimizden gider ve tabloda hiçbir iz bırakmaz.
//
// KİLİT: 3DS tahsilat cevabındaki komisyon alanları niyetin `raw` gövdesine
// yazılır. Para yolu DEĞİŞMEZ — yalnız görünürlük eklenir.
// ═══════════════════════════════════════════════════════════════════════════

const KOK = path.resolve(__dirname, '../..');
const geriCagri = () =>
  readFileSync(path.join(KOK, 'supabase/functions/iyzico-3ds-callback/index.ts'), 'utf-8');

describe('iyzico maliyeti niyete yazılır', () => {
  it('komisyonun her iki bileşeni de okunur (oransal + sabit)', () => {
    const s = geriCagri();
    expect(s).toContain('auth.iyziCommissionRateAmount');
    expect(s).toContain('auth.iyziCommissionFee');
  });

  it('mutabakat çıpası — iyzico bize ne ödeyecek — saklanır', () => {
    expect(geriCagri()).toContain('auth.merchantPayoutAmount');
  });

  it('psp bloğu apply_card_payment çağrısının raw gövdesine giriyor', () => {
    const s = geriCagri();
    const blok = s.indexOf('const psp = {');
    const cagri = s.indexOf("rpc('apply_card_payment'", blok);
    expect(blok, 'psp bloğu yok').toBeGreaterThan(-1);
    expect(cagri, 'psp bloğu apply_card_payment ÖNCESİNDE kurulmalı').toBeGreaterThan(blok);
    // raw gövdesinde gerçekten geçiyor mu?
    expect(s.slice(cagri, cagri + 400)).toContain('psp');
  });

  it('sayısal olmayan cevap alanı sessizce 0 sayılmaz, null olur', () => {
    // iyzico bu alanları bazen metin olarak döndürür; Number(...) NaN verirse
    // 0 yazmak "komisyon alınmadı" yalanını tabloya sokar.
    const s = geriCagri();
    expect(s).toContain('Number.isFinite(n) ? n : null');
  });

  it('tahsilat akışı psp okunamazsa DURMAZ (görünürlük parayı bloklamaz)', () => {
    // psp alanları yalnız okunur; hiçbir throw/return eklenmemeli.
    const s = geriCagri();
    const blok = s.slice(s.indexOf('const psp = {'), s.indexOf("rpc('apply_card_payment'"));
    expect(blok).not.toMatch(/throw|return |RAISE/);
  });
});
