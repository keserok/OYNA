import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ─── SEVİYE BEYANI YAZMA SÖZLEŞMESİ ─────────────────────────────────────────
//
// authenticated'ın profiles UPDATE yetkisi KOLON-BAZLI ve self_skill listede
// yok — beyan doğrudan kolon yazımıyla giderse tüm PATCH 42501 ile düşer.
// Sabitlenenler:
//   • beyanın TEK yazma yolu set_my_self_skill RPC'sidir
//   • updateProfileBasics'in alan tipi self_skill İÇERMEZ (tsc kapısı) ve
//     çalışma anında payload'a sızmaz
//   • sheet'te beyan null'a ÇEVRİLEMEZ (seçili yıldıza dokunmak silmez)

// Genel setup userService'i {setActiveRole} ile mockluyor — burada GERÇEK
// modülün yazma yolunu test ediyoruz.
vi.unmock('../../services/userService');

const RPC: { fn: string; args: unknown }[] = [];
const UPDATES: Record<string, unknown>[] = [];

vi.mock('../../supabaseClient', () => ({
  supabase: {
    rpc: (fn: string, args: unknown) => {
      RPC.push({ fn, args });
      return Promise.resolve({ data: { ok: true }, error: null });
    },
    from: () => ({
      update: (fields: Record<string, unknown>) => {
        UPDATES.push(fields);
        return { eq: async () => ({ error: null }) };
      },
    }),
  },
}));

vi.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: (_t, tag: string) => ({ children, ...p }: any) => {
      const { initial, animate, exit, transition, whileTap, whileHover, layout, ...rest } = p;
      return React.createElement(tag as string, rest, children);
    },
  }),
  AnimatePresence: ({ children }: any) => children,
}));

vi.mock('../../hooks/useImageUpload', () => ({
  useImageUpload: () => ({ uploadImage: vi.fn(async () => ''), uploading: false, progress: 0 }),
}));

import { setMySelfSkill, updateProfileBasics } from '../../services/userService';
import { ProfileEditSheet } from '../../components/profile/ProfileEditSheet';

beforeEach(() => { RPC.length = 0; UPDATES.length = 0; });

describe('seviye beyanı — yazma yolu', () => {
  it('setMySelfSkill yalniz set_my_self_skill RPCsini cagirir', async () => {
    await setMySelfSkill(7);
    expect(RPC).toEqual([{ fn: 'set_my_self_skill', args: { p_value: 7 } }]);
    expect(UPDATES).toHaveLength(0); // kolon yazımı YOK
  });

  it('updateProfileBasics payloadina self_skill sizamaz', async () => {
    await updateProfileBasics('u1', { position: 'orta', bio: 'x', play_style: 'rahat' });
    expect(UPDATES).toHaveLength(1);
    expect(Object.keys(UPDATES[0])).not.toContain('self_skill');
    expect(RPC).toHaveLength(0);
  });
});

describe('ProfileEditSheet — beyan geri alınamaz', () => {
  const ciz = () => {
    const onSave = vi.fn();
    render(
      <ProfileEditSheet
        open title="Profili Düzenle"
        initial={{ position: 'orta', bio: '', birthdate: '', gender: '', playStyle: '', avatarUrl: '', selfSkill: 7 }}
        saving={false} onSave={onSave} onClose={vi.fn()}
      />,
    );
    return onSave;
  };

  it('secili yildiza tekrar dokunmak beyani SILMEZ (null gonderilmez)', () => {
    const onSave = ciz();
    // Beyan 7 iken 7. yıldıza tekrar dokun → değer 7 KALIR
    fireEvent.click(screen.getByLabelText('Seviye 7'));
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].selfSkill).toBe(7);
  });

  it('farkli yildiza dokunmak beyani gunceller', () => {
    const onSave = ciz();
    fireEvent.click(screen.getByLabelText('Seviye 9'));
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    expect(onSave.mock.calls[0][0].selfSkill).toBe(9);
  });
});
