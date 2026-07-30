import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('framer-motion', () => {
  const strip = ({
    children, whileHover, whileTap, transition, initial, animate, exit, layout, layoutId,
    variants, custom, ...props
  }: any) => ({ children, props });
  const cache = new Map<string, unknown>();
  const motionProxy = new Proxy({}, {
    get: (_t, tag: string) => {
      if (!cache.has(tag)) {
        cache.set(tag, React.forwardRef((allProps: any, ref: any) => {
          const { children, props } = strip(allProps);
          return React.createElement(tag, { ...props, ref }, children);
        }));
      }
      return cache.get(tag);
    },
  });
  return { motion: motionProxy, AnimatePresence: ({ children }: any) => children };
});

import { MatchLobbyHeader } from '../../../admin-panel/views/components/MatchLobbyHeader';
import type { MatchListing } from '../../../types';

const matchFixture: MatchListing = {
  id: 'match-1',
  title: 'Perşembe Klasiği',
  location: 'Altınordu Arena',
  time: '21:00',
  date: '5 Ağu',
  rawDate: '2026-08-05',
  price: 200,
  difficulty: 'Rahat',
  image: '',
  badges: ['Rahat'],
  missingPositions: [],
  slots: [],
  status: 'ACTIVE',
  format: '7v7',
  visibility: 'OPEN',
};

describe('Maç Lobisi Başlık Aynası (admin)', () => {
  const onSave = vi.fn(async () => {});
  beforeEach(() => vi.clearAllMocks());

  it('lobi öğelerini uygulamadaki başlıkla aynı içerikle çizer', () => {
    render(<MatchLobbyHeader match={matchFixture} busy={false} onSave={onSave} />);
    expect(screen.getByText('Perşembe Klasiği')).toBeInTheDocument();
    expect(screen.getByText('Altınordu Arena')).toBeInTheDocument();
    expect(screen.getByText('5 Ağu')).toBeInTheDocument();
    expect(screen.getByText('21:00')).toBeInTheDocument();
    expect(screen.getByText(/200 ₺ \/ kişi/)).toBeInTheDocument();
    expect(screen.getByText('HERKESE AÇIK')).toBeInTheDocument();
  });

  it('ücrete tıkla → düzenleyici açılır → Kaydet payload + yerel yamayı üretir', async () => {
    render(<MatchLobbyHeader match={matchFixture} busy={false} onSave={onSave} />);
    fireEvent.click(screen.getByText(/200 ₺ \/ kişi/));
    const input = await screen.findByDisplayValue('200');
    fireEvent.change(input, { target: { value: '275' } });
    fireEvent.click(screen.getByRole('button', { name: /Kaydet/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [payload, patch] = onSave.mock.calls[0] as [Record<string, unknown>, Partial<MatchListing>];
    expect(payload).toEqual({ price: 275 });
    expect(patch).toEqual({ price: 275 });
  });

  it('tarih düzenleme ham ISO gönderir, görünen etiketi günceller', async () => {
    render(<MatchLobbyHeader match={matchFixture} busy={false} onSave={onSave} />);
    fireEvent.click(screen.getByText('5 Ağu'));
    const input = await screen.findByDisplayValue('2026-08-05');
    fireEvent.change(input, { target: { value: '2026-09-01' } });
    fireEvent.click(screen.getByRole('button', { name: /Kaydet/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [payload, patch] = onSave.mock.calls[0] as [Record<string, unknown>, Partial<MatchListing>];
    expect(payload).toEqual({ date: '2026-09-01' });
    expect(patch.rawDate).toBe('2026-09-01');
    expect(typeof patch.date).toBe('string');
  });

  it('görünürlük PRIVATE + kod → payload private_code büyük harfle gider', async () => {
    render(<MatchLobbyHeader match={matchFixture} busy={false} onSave={onSave} />);
    fireEvent.click(screen.getByText('HERKESE AÇIK'));
    fireEvent.click(await screen.findByRole('button', { name: 'Özel (Kodlu)' }));
    fireEvent.change(screen.getByPlaceholderText(/Kod/), { target: { value: 'abc123' } });
    fireEvent.click(screen.getByRole('button', { name: /Kaydet/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [payload] = onSave.mock.calls[0] as [Record<string, unknown>];
    expect(payload).toEqual({ visibility: 'PRIVATE', private_code: 'ABC123' });
  });
});
