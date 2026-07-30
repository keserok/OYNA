import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MatchLobbyRoster } from '../../../admin-panel/views/components/MatchLobbyRoster';
import type { PositionSlot, AdminUser } from '../../../types';

// ─── E9 · Admin Rahat kadrosu — SÖZLEŞME ────────────────────────────────────
//
// Sabitlenenler:
//   • oyuncuyla AYNI beş satır durumu (OPEN / oyuncu / RESERVED / LINK_PENDING
//     / DAVETLİ) — saha çizimi yok
//   • RESERVED + LINK_PENDING doluluk sayımında DOLU
//   • seviye çipi BAND'dır (ham self_skill asla); beyan yoksa çip yok
//   • boş satırda aksiyon yok; dolu satırda Çıkar (iade) + Takım değiştir
//   • aksiyonlar doğru slotId + isAway ile çağrılır

const users: AdminUser[] = [
  { id: 'u-satici', name: 'Satıcı Kişi', email: 's@o.app', avatar: '' } as AdminUser,
];

const SLOTS: PositionSlot[] = [
  { id: 'w0', role: 'OYUNCU', status: 'OPEN' } as PositionSlot,
  {
    id: 'w1', role: 'OYUNCU', status: 'TAKEN', occupant: 'u1', purchasedBy: 'u1',
    player: { id: 'u1', name: 'Ali Oyuncu', avatar: '', position: 'OYUNCU', selfSkill: 9 },
  } as unknown as PositionSlot,
  {
    id: 'w2', role: 'OYUNCU', status: 'TAKEN', purchasedBy: 'u-satici',
    assignmentStatus: 'RESERVED',
  } as unknown as PositionSlot,
];

const AWAY: PositionSlot[] = [
  {
    id: 'r0', role: 'OYUNCU', status: 'TAKEN', purchasedBy: 'u-satici',
    assignmentStatus: 'LINK_PENDING',
  } as unknown as PositionSlot,
  {
    id: 'r1', role: 'OYUNCU', status: 'TAKEN', occupant: 'u2', purchasedBy: 'u-satici',
    assignmentStatus: 'ASSIGNED',
    player: { id: 'u2', name: 'Davetli Veli', avatar: '', position: 'OYUNCU' },
  } as unknown as PositionSlot,
  { id: 'r2', role: 'OYUNCU', status: 'OPEN' } as PositionSlot,
];

const ciz = (over: Partial<React.ComponentProps<typeof MatchLobbyRoster>> = {}) => {
  const onKick = vi.fn();
  const onMoveTeam = vi.fn();
  render(
    <MatchLobbyRoster slots={SLOTS} awaySlots={AWAY} users={users} busy={false}
      onKick={onKick} onMoveTeam={onMoveTeam} {...over} />,
  );
  return { onKick, onMoveTeam };
};

describe('MatchLobbyRoster — beş satır durumu', () => {
  it('iki kolon + doluluk: RESERVE ve LINK_PENDING DOLU sayılır (2/3 her iki takım)', () => {
    ciz();
    expect(screen.getByText('BEYAZ TAKIM')).toBeInTheDocument();
    expect(screen.getByText('KIRMIZI TAKIM')).toBeInTheDocument();
    // Beyaz: w1 oyuncu + w2 rezerve = 2/3 · Kırmızı: r0 kod + r1 davetli = 2/3
    expect(screen.getAllByText('2/3')).toHaveLength(2);
  });

  it('bes durum ayni dilde: bos yer, oyuncu+band, rezerve, davet kodu, DAVETLI', () => {
    ciz();
    expect(screen.getAllByText('+ Boş yer')).toHaveLength(2);          // w0 + r2
    expect(screen.getByText('Ali Oyuncu')).toBeInTheDocument();
    expect(screen.getByText('İLERİ')).toBeInTheDocument();              // band(9) — ham 9 yok
    expect(screen.queryByText('9')).not.toBeInTheDocument();
    expect(screen.getByText('Rezerve — Satıcı Kişi dolduracak')).toBeInTheDocument();
    expect(screen.getByText('Davet kodu paylaşıldı')).toBeInTheDocument();
    expect(screen.getByText('DAVETLİ')).toBeInTheDocument();
    // Davetlinin beyanı yok → onun satırında band çipi çizilmez (uydurma yok)
    expect(screen.queryByText('BAŞLANGIÇ')).not.toBeInTheDocument();
  });

  it('bos satirda aksiyon yok; dolu satir sayisi kadar Cikar + Tasi butonu var', () => {
    ciz();
    // 4 dolu satır (w1, w2, r0, r1) → 4'er aksiyon
    expect(screen.getAllByLabelText('Çıkar (iade)')).toHaveLength(4);
    expect(screen.getAllByLabelText('Takım değiştir')).toHaveLength(4);
  });

  it('aksiyonlar dogru slotId + isAway ile cagrilir', () => {
    const { onKick, onMoveTeam } = ciz();
    // Beyaz'ın ilk dolu satırı w1 → isAway=false
    fireEvent.click(screen.getAllByLabelText('Çıkar (iade)')[0]);
    expect(onKick).toHaveBeenCalledWith('w1', false);
    // Kırmızı'nın ilk dolu satırı r0 → isAway=true (Beyaz'da 2 dolu var)
    fireEvent.click(screen.getAllByLabelText('Takım değiştir')[2]);
    expect(onMoveTeam).toHaveBeenCalledWith('r0', true);
  });

  it('busy iken aksiyonlar pasif', () => {
    const { onKick } = ciz({ busy: true });
    const btn = screen.getAllByLabelText('Çıkar (iade)')[0];
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onKick).not.toHaveBeenCalled();
  });
});
