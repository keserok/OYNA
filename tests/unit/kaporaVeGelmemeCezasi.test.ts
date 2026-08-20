import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

// ═══════════════════════════════════════════════════════════════════════════
// KAPORA GÖRÜNÜRLÜĞÜ + GELMEME CEZASI — karar kilitleri (19 Ağustos 2026)
//
//   · Ceza deftere BORÇ yazılır, kapalı cüzdandan tahsil edilmeye çalışılmaz
//   · Ceza tabanı: EN BÜYÜK(maç payı, asgari) — ücretsiz maçta sıfıra düşmez
//   · Kapora ödemeleri ve iade kuyruğu yönetici panelinde görünür
//   · İade sistem tarafından DEĞİL, insan eliyle gönderilir
// ═══════════════════════════════════════════════════════════════════════════

const KOK = path.resolve(__dirname, '../..');
const oku = (rel: string) => readFileSync(path.join(KOK, rel), 'utf-8');
const goc = () => oku('supabase/migrations/20260911000004_gelmeme_cezasi_ve_kapora_gorunurlugu.sql');
const panel = () => oku('admin-panel/views/components/KaporaPanel.tsx');
const servis = () => oku('admin-panel/services/adminService.ts');
const finans = () => oku('admin-panel/views/pages/FinancePage.tsx');

/**
 * Yalnız `captain_report_no_show`un GÖVDESİ.
 *
 * Dosya başındaki açıklama, kaldırılan eski kodu (`wallet_spend_balance`, sessiz
 * EXCEPTION) bilerek ALINTILIYOR — okuyan neyin neden değiştiğini görsün diye.
 * Doğrulama bloğu da aynı kalıpların yokluğunu sınıyor. Bu yüzden testler tüm
 * dosyaya değil, çalışan gövdeye bakmalı; yoksa kendi belgemizle çakışırız.
 */
const cezaGovdesi = () => {
  const s = goc();
  const bas = s.indexOf('CREATE OR REPLACE FUNCTION public.captain_report_no_show');
  const son = s.indexOf('-- ── Kapora tablosu');
  expect(bas, 'captain_report_no_show gövdesi bulunamadı').toBeGreaterThan(-1);
  expect(son, 'gövdenin sonu bulunamadı').toBeGreaterThan(bas);
  return s.slice(bas, son);
};

describe('gelmeme cezası deftere borç yazılıyor', () => {
  it('kapalı cüzdandan tahsil denemesi kaldırıldı', () => {
    // Eski gövde `wallet_spend_balance` çağırıyor, hatayı da boş bir EXCEPTION
    // bloğuyla yutuyordu — ceza fiilen hiç uygulanmıyordu.
    expect(cezaGovdesi()).not.toContain('wallet_spend_balance');
  });

  it('hata artık sessizce yutulmuyor', () => {
    expect(cezaGovdesi()).not.toMatch(/EXCEPTION WHEN OTHERS THEN\s+v_charged := false/);
  });

  it('ceza tabanı maç payı ile asgarinin BÜYÜĞÜ', () => {
    expect(cezaGovdesi()).toContain("GREATEST(COALESCE(v_match.price, 0), v_min)");
    expect(cezaGovdesi()).toContain("get_config_number('provider_noshow_penalty_min', 500)");
  });

  it('deftere NEGATİF hakediş satırı yazılıyor', () => {
    const g = cezaGovdesi();
    expect(g).toContain('-v_penalty');
    expect(g).toContain("'EARNINGS'");
  });

  it('aynı maç için ikinci ceza yazılmıyor', () => {
    expect(cezaGovdesi()).toContain('WHERE NOT EXISTS');
  });

  it('sağlayıcı ne kadar ve NASIL tahsil edileceğini birlikte okuyor', () => {
    const g = cezaGovdesi();
    expect(g).toContain('borç olarak yazıldı');
    expect(g).toContain('ödemeden düşülecek');
  });
});

describe('kapora yönetici panelinde görünüyor', () => {
  it('okuma fonksiyonu yalnız yöneticiye açık', () => {
    const g = goc();
    expect(g).toContain('admin_kapora_ozeti');
    expect(g).toContain('IF NOT public.is_platform_admin() THEN RAISE EXCEPTION');
    expect(g).toContain('FROM PUBLIC, anon');
  });

  it('kırılım eksiksiz: çekilen · taban · kart bedeli · yuvarlama', () => {
    const g = goc();
    for (const alan of ['AS cekilen', 'AS kapora_taban', 'AS kart_bedeli', 'AS yuvarlama']) {
      expect(g, alan).toContain(alan);
    }
  });

  it('panel finans sayfasına ilk sekme olarak bağlandı', () => {
    const f = finans();
    expect(f).toContain("{ id: 'kapora' as const, label: 'Kapora' }");
    expect(f).toContain("{tab === 'kapora' && <KaporaPanel />}");
    // Varsayılan sekme kapora: iade kuyruğu bir iş listesi, önce görülmeli.
    expect(f).toContain(">('kapora')");
  });

  it('servis katmanında iki okuma da tanımlı', () => {
    const s = servis();
    expect(s).toContain('export async function fetchKaporaOzeti');
    expect(s).toContain('export async function fetchBekleyenKaporaIadeleri');
  });
});

describe('iade insan eliyle gönderiliyor', () => {
  it('panelde iade düğmesi var ve onay istiyor', () => {
    const p = panel();
    expect(p).toContain('forceRefundIntentAdmin');
    expect(p).toContain('window.confirm');
  });

  it('yalnız İADE BEKLİYOR satırında düğme çıkıyor', () => {
    expect(panel()).toContain("r.durum === 'REFUND_PENDING' && !!r.niyet_id");
  });

  it('çift tıklama çifte iade üretemiyor', () => {
    const p = panel();
    expect(p).toContain('setGonderilen');
    expect(p).toContain('disabled={gonderilen === r.niyet_id}');
  });

  it('ham İngilizce durum kodu ekrana çıkmıyor', () => {
    const p = panel();
    for (const [kod, tr] of [['REFUND_PENDING', 'İADE BEKLİYOR'], ['BLOCKED', 'Tahsil edildi'],
                             ['AWAITING_PAYMENT', 'Ödeme bekliyor']] as const) {
      expect(p, kod).toContain(tr);
    }
  });

  it('yöneticiye iadenin ELLE yapıldığı yazıyor', () => {
    expect(panel()).toContain('İade bu ekrandan elle yapılır');
  });
});
