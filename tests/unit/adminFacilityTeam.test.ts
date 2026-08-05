// IP-22 (3. bölüm) bekçisi — tesis yetkilileri yönetici panelinden atanır,
// tesis doğrulama alanı tamamen kalktı.
//
// Kilitlenen sözler:
//   1. Yetki düzeyi ÜÇ tanedir ve tek yerden tanımlanır: Sahip · Müdür · Personel.
//      Ekrandaki etiket serbest metin değil, yetkiden türetilir.
//   2. Yönetici, bir uygulama hesabını davet kodu beklemeden tesise bağlayabilir.
//   3. `pitches.verification_status` diye bir alan yok; onu okuyan/yazan hiçbir
//      kod kalmadı. (`profiles.verification_status` AYRI şeydir — kaleci/hakem
//      başvurusu — ve yerinde durur.)
//   4. Tesisin oyuncuya görünme kapısı yalnız "yayında + açık".

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const KOK = process.cwd();
const oku = (p: string) => readFileSync(join(KOK, p), 'utf8');

const GOC_YETKI = 'supabase/migrations/20260901000000_ip22b_tesis_yetkilileri_admin.sql';
const GOC_ALAN = 'supabase/migrations/20260901000001_ip22c_tesis_dogrulama_alani_kaldirildi.sql';

/** Tüm uygulama + yönetici paneli kaynağı. */
function kaynaklar(): string[] {
  const out: string[] = [];
  const gez = (d: string) => {
    for (const ad of readdirSync(join(KOK, d))) {
      const rel = `${d}/${ad}`;
      if (statSync(join(KOK, rel)).isDirectory()) gez(rel);
      else if (/\.tsx?$/.test(ad)) out.push(rel);
    }
  };
  gez('views');
  gez('components');
  gez('services');
  gez('shared');
  gez('admin-panel');
  return [...out, 'App.tsx', 'types.ts', 'store.ts', 'supabaseMutations.ts'];
}

describe('üç yetki düzeyi tek tanımdan gelir', () => {
  const sql = oku(GOC_YETKI);

  it('ekrandaki etiket yetkiden türetiliyor — serbest unvan yok', () => {
    // Eskiden role_title serbest metindi ("Resepsiyon", "Tesis Müdürü", "Saha
    // Sorumlusu"); staff_role ile hiç örtüşmüyordu. Artık sunucu tetikleyicisi
    // etiketi yetkiden yazar, kullanıcı girdisi kabul edilmez.
    expect(sql).toContain('CREATE TRIGGER trg_pitch_staff_role_title');
    expect(sql).toContain("NEW.role_title := CASE WHEN NEW.staff_role = 'MANAGER' THEN 'Müdür' ELSE 'Personel' END");
    // Var olan kayıtlar da tek seferde hizalandı.
    expect(sql).toContain('UPDATE public.pitch_staff_members\n   SET role_title =');
  });

  it('etiketler uygulamada da tek yerden okunuyor', () => {
    const s = oku('admin-panel/services/adminService.ts');
    expect(s).toContain("MANAGER: 'Müdür'");
    expect(s).toContain("STAFF: 'Personel'");
  });

  it('yönetici hesabı doğrudan bağlıyor — davet kodu beklemiyor', () => {
    expect(sql).toContain('FUNCTION public.admin_set_pitch_staff');
    const govde = sql.slice(sql.indexOf('FUNCTION public.admin_set_pitch_staff'));
    expect(govde).toContain("'ACTIVE'");
    expect(govde).toContain('public.is_platform_admin()');
  });

  it('sahip aynı anda müdür/personel yapılamaz', () => {
    expect(sql).toContain('ALREADY_OWNER');
  });

  it('yetki kaldırma ve okuma çağrıları da yönetici korumalı', () => {
    for (const fn of ['admin_remove_pitch_staff', 'admin_pitch_team']) {
      const i = sql.indexOf(`FUNCTION public.${fn}`);
      expect(i, fn).toBeGreaterThan(-1);
      expect(sql.slice(i, i + 900), fn).toContain('is_platform_admin()');
    }
  });

  it('yetki değişiklikleri denetim kaydına yazılıyor', () => {
    expect(sql).toContain("'PITCH_STAFF_SET'");
    expect(sql).toContain("'PITCH_STAFF_REMOVE'");
  });
});

describe('Kurulum Merkezi — Yetkililer sekmesi', () => {
  const s = oku('admin-panel/views/components/PitchStudio.tsx');

  it('sekme var ve tesis kaydedilmeden açılmıyor', () => {
    expect(s).toContain("{ id: 'team', label: 'Yetkililer', icon: ShieldCheck, requiresId: true }");
  });

  it('üç düzey de ekranda sade dille anlatılıyor', () => {
    const blok = s.slice(s.indexOf("{activeTab === 'team' && id && ("));
    expect(blok).toContain('Sahip');
    expect(blok).toContain('Müdür');
    expect(blok).toContain('Personel');
  });

  it('sahibi olmayan tesis için uyarı ve kısa yol var', () => {
    expect(s).toContain('Bu tesisin sahibi yok — sahipsiz tesis vitrine çıkarılamaz.');
    expect(s).toContain('Sahip ata');
  });

  it('yetkili arama en az 2 harf istiyor — tüm kullanıcıları dökmüyor', () => {
    const svc = oku('admin-panel/services/adminService.ts');
    const fn = svc.slice(svc.indexOf('export async function searchStaffCandidatesAdmin'));
    expect(fn.slice(0, 500)).toContain('if (q.length < 2) return [];');
  });

  it('hesabı bağlı olmayan kayıt dürüstçe işaretleniyor', () => {
    expect(s).toContain('uygulama hesabı bağlı değil');
  });
});

describe('tesis doğrulama alanı kaldırıldı', () => {
  const sql = oku(GOC_ALAN);

  it('kolonlar düşürüldü', () => {
    expect(sql).toContain('ALTER TABLE public.pitches DROP COLUMN IF EXISTS verification_status');
    expect(sql).toContain('ALTER TABLE public.pitches DROP COLUMN IF EXISTS verification_notes');
  });

  it('kolonu okuyan HER fonksiyon kolon düşmeden önce yeniden yazıldı', () => {
    const dusme = sql.indexOf('DROP COLUMN IF EXISTS verification_status');
    for (const fn of [
      'public.get_nearby_pitches',
      'public.get_showcase_availability',
      'public.protect_pitch_identity_fields',
      'public.admin_dashboard_stats',
      'public.admin_ops_queue',
      'public.admin_fetch_pitches',
      'public.admin_create_pitch',
      'public.admin_update_pitch',
      'public.seed_owner_demo',
      'public.seed_module_demo',
    ]) {
      const i = sql.indexOf(`FUNCTION ${fn}`);
      expect(i, `${fn} yeniden yazılmamış`).toBeGreaterThan(-1);
      expect(i, `${fn} kolon düştükten SONRA yazılmış`).toBeLessThan(dusme);
    }
  });

  it('tesis onay/ret çağrıları silindi', () => {
    const yetki = oku(GOC_YETKI);
    expect(yetki).toContain('DROP FUNCTION IF EXISTS public.admin_moderate_pitch(uuid, boolean, text)');
    expect(yetki).toContain('DROP FUNCTION IF EXISTS public.admin_moderate_pitch__core(uuid, boolean, text)');
    // Bekleyen rezervasyon reddi de artık karşılıksız.
    expect(yetki).toContain('DROP FUNCTION IF EXISTS public.staff_reject_pending(uuid, text)');
  });

  it('oyuncu profilinin doğrulaması KALDIRILMADI — kaleci/hakem başvurusu ayrı', () => {
    expect(sql).toContain("FROM public.profiles WHERE verification_status = 'pending'");
    expect(oku('services/userService.ts')).toContain('verification_status');
  });
});

describe('uygulamada tesis onayından eser kalmadı', () => {
  it('hiçbir kaynak dosya tesis doğrulamasına atıf yapmıyor', () => {
    // profiles tarafı (kaleci/hakem) meşru; ayıklanan dosyalar onlar.
    const PROFIL_TARAFI = new Set([
      'supabaseAuth.ts',
      'services/userService.ts',
      'services/serviceProviderService.ts',
      'views/ServiceApplication.tsx',
      'views/PendingVerificationView.tsx',
      'views/ProfileScreen.tsx',
      // Profil düzenleme Ayarlar'a taşındı (2026-08); "doğrulanmış" rozeti
      // kimlik kartıyla birlikte buraya da geldi — profil tarafı, tesis değil.
      'components/settings/ProfileInfoPage.tsx',
      'components/settings/FieldRolePage.tsx',
      'admin-panel/services/adminService.ts',
      'admin-panel/views/PendingVerificationsTab.tsx',
      'admin-panel/views/components/UserProfileMirror.tsx',
      'admin-panel/views/components/ProviderDetailPanel.tsx',
      'admin-panel/views/DeepEditModals.tsx',
      'App.tsx',
    ]);
    const ihlal: string[] = [];
    for (const yol of kaynaklar()) {
      if (PROFIL_TARAFI.has(yol)) continue;
      oku(yol).split('\n').forEach((satir, i) => {
        if (/verification_status|verificationStatus|isApproved/.test(satir)) ihlal.push(`${yol}:${i + 1}`);
      });
    }
    expect(ihlal, `tesis onayı geri sızmış:\n${ihlal.join('\n')}`).toEqual([]);
  });

  it('yönetici sayaçları artık olmayan bir kuyruğu saymıyor', () => {
    for (const yol of [
      'admin-panel/services/adminService.ts',
      'admin-panel/views/pages/DashboardPage.tsx',
      'admin-panel/views/pages/CommandCenterPage.tsx',
    ]) {
      expect(oku(yol), yol).not.toContain('pending_pitches');
    }
  });

  it('tesis listesindeki süzgeç artık vitrin durumu', () => {
    const s = oku('admin-panel/utils/pitchMapper.ts');
    expect(s).toContain("export type PitchStatusFilter = 'ALL' | 'published' | 'hidden';");
    expect(s).not.toContain("'approved'");
  });

  it('onay kuyruğu ekranı kalktı — ad/konum talepleri DURUYOR', () => {
    const s = oku('admin-panel/views/OwnerModerationTab.tsx');
    expect(s).not.toContain('moderatePitch');
    expect(s).not.toContain('Onay Bekleyen Tesisler');
    expect(s).toContain('fetchPendingChangeRequests');
    expect(s).toContain('reviewPitchChangeRequest');
  });
});

describe('görünürlüğün tek kapısı: yayında + açık', () => {
  const sql = oku(GOC_ALAN);

  it('yakındaki tesisler sorgusu', () => {
    const fn = sql.slice(sql.indexOf('FUNCTION public.get_nearby_pitches'));
    const govde = fn.slice(0, fn.indexOf('$function$;'));
    expect(govde).toContain('pt.is_open IS TRUE');
    expect(govde).toContain('pt.is_published IS DISTINCT FROM false');
    expect(govde).not.toContain('verification_status');
  });

  it('vitrin doluluk sorgusu', () => {
    const fn = sql.slice(sql.indexOf('FUNCTION public.get_showcase_availability'));
    const govde = fn.slice(0, fn.indexOf('$function$;'));
    expect(govde).toContain('p.is_published = true');
    expect(govde).not.toContain('verification_status');
  });

  it('oyuncu tarafındaki vitrin sorgusu', () => {
    const s = oku('views/PitchDiscovery.tsx');
    expect(s).toContain("eq('is_open', true)");
    expect(s).toContain("eq('is_published', true)");
  });
});
