import React from 'react';
import { NeonButton } from 'oyna-app';

// The DS is a dark, neon theme — every preview sits on the app's brand surface
// so light text and glass fills read correctly.
const Surface: React.FC<{ children: React.ReactNode; column?: boolean; width?: number }> = ({
  children,
  column,
  width,
}) => (
  <div
    style={{
      background: '#0A0E14',
      padding: 28,
      borderRadius: 20,
      display: 'flex',
      flexDirection: column ? 'column' : 'row',
      flexWrap: 'wrap',
      gap: 14,
      alignItems: 'center',
      justifyContent: 'center',
      width: width ? width : undefined,
    }}
  >
    {children}
  </div>
);

export const Variants = () => (
  <Surface>
    <NeonButton variant="primary">Kaydet</NeonButton>
    <NeonButton variant="secondary">Vazgeç</NeonButton>
    <NeonButton variant="danger">Sil</NeonButton>
    <NeonButton variant="ghost">Daha fazla</NeonButton>
  </Surface>
);

export const Sizes = () => (
  <Surface>
    <NeonButton size="sm">Küçük</NeonButton>
    <NeonButton size="md">Orta</NeonButton>
    <NeonButton size="lg">Büyük</NeonButton>
  </Surface>
);

export const States = () => (
  <Surface>
    <NeonButton>Aktif</NeonButton>
    <NeonButton loading>Yükleniyor</NeonButton>
    <NeonButton disabled>Pasif</NeonButton>
  </Surface>
);

export const FullWidthCta = () => (
  <Surface column width={320}>
    <NeonButton fullWidth variant="primary" size="lg">
      Maça Katıl
    </NeonButton>
    <NeonButton fullWidth variant="secondary">
      Takımı Görüntüle
    </NeonButton>
  </Surface>
);
