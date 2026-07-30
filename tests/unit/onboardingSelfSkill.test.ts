import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { OnboardingDraft } from '../../views/onboarding/onboardingShared';

// ─── ONBOARDING SEVİYE KAPISI — SUNUCU SÖZLEŞMESİ ───────────────────────────
//
// apply_onboarding(p_completed=true) sunucuda self_skill NULL ise
// SELF_SKILL_REQUIRED fırlatır (ad-soyad kapısının ikizi). Bu testler istemci
// tarafının o sözleşmeyi doğru beslediğini korur:
//   • seçilen beyan p_self_skill olarak GİDER
//   • beyan yoksa null gider (0 ya da varsayılan bir sayı DEĞİL)
//   • forward-only: null gönderimi sunucuda mevcut değeri silmez

const RPC: { fn: string; args: any }[] = [];

vi.mock('../../supabaseClient', () => ({
  supabase: {
    rpc: (fn: string, args: any) => {
      RPC.push({ fn, args });
      return Promise.resolve({ data: { ok: true }, error: null });
    },
  },
}));

import { applyOnboarding } from '../../services/onboardingService';

const taslak = (over: Partial<OnboardingDraft> = {}): OnboardingDraft => ({
  ageRange: '24-30',
  firstName: 'Ali',
  lastName: 'Vural',
  gender: 'erkek',
  position: 'orta',
  playStyle: 'rahat',
  selfSkill: null,
  locationGranted: true,
  completedAt: 0,
  ...over,
});

beforeEach(() => { RPC.length = 0; });

describe('applyOnboarding — beyan edilen seviye', () => {
  it('secilen beyan p_self_skill olarak gonderilir', async () => {
    await applyOnboarding(taslak({ selfSkill: 7 }), true);
    expect(RPC[0].fn).toBe('apply_onboarding');
    expect(RPC[0].args.p_self_skill).toBe(7);
    expect(RPC[0].args.p_completed).toBe(true);
  });

  it('beyan yoksa null gider — 0 ya da uydurma bir sayi DEGIL', async () => {
    await applyOnboarding(taslak({ selfSkill: null }), false);
    expect(RPC[0].args.p_self_skill).toBeNull();
    expect(RPC[0].args.p_self_skill).not.toBe(0);
  });

  it('atlama (completed=false) da beyani tasir — forward-only birlesim', async () => {
    await applyOnboarding(taslak({ selfSkill: 4 }), false);
    expect(RPC[0].args.p_self_skill).toBe(4);
    expect(RPC[0].args.p_completed).toBe(false);
  });

  it('sinir degerler bozulmadan gecer', async () => {
    await applyOnboarding(taslak({ selfSkill: 1 }), true);
    expect(RPC[0].args.p_self_skill).toBe(1);
    RPC.length = 0;
    await applyOnboarding(taslak({ selfSkill: 10 }), true);
    expect(RPC[0].args.p_self_skill).toBe(10);
  });
});
