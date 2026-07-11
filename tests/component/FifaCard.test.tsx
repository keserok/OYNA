import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FifaCard } from '../../components/FifaCard';
import React from 'react';

describe('FifaCard', () => {
  const defaultStats = {
    label1: 'HIZ', val1: 85,
    label2: 'ŞUT', val2: 80,
    label3: 'PAS', val3: 78,
    label4: 'DRİ', val4: 82,
    label5: 'DEF', val5: 50,
    label6: 'FİZ', val6: 75,
  };

  it('verilen isim, rating, rol ve kulüp adını render eder', () => {
    render(
      <FifaCard
        rating={88}
        role="GOALKEEPER"
        name="Kerem"
        avatar="https://avatar.png"
        stats={defaultStats}
        clubName="Keserok FC"
      />
    );

    expect(screen.getByText('Kerem')).toBeInTheDocument();
    expect(screen.getByText('88')).toBeInTheDocument();
    expect(screen.getByText('GK')).toBeInTheDocument();
    expect(screen.getByText('Keserok FC')).toBeInTheDocument();
  });

  it('oyuncu rolü (GK/REF dışı) için PLY render eder', () => {
    render(
      <FifaCard
        rating={90}
        role="MID"
        name="Kerem"
        avatar="https://avatar.png"
        stats={defaultStats}
      />
    );

    expect(screen.getByText('PLY')).toBeInTheDocument();
  });

  it('stats değerlerini ve etiketlerini render eder', () => {
    render(
      <FifaCard
        rating={88}
        role="MID"
        name="Kerem"
        avatar="https://avatar.png"
        stats={defaultStats}
      />
    );

    expect(screen.getByText('HIZ')).toBeInTheDocument();
    expect(screen.getByText('85')).toBeInTheDocument();
    expect(screen.getByText('ŞUT')).toBeInTheDocument();
    expect(screen.getByText('80')).toBeInTheDocument();
  });
});
