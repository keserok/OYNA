import React from 'react';
import { AnimatedButton } from 'oyna-app';

// The DS is a dark, neon theme — every preview sits on the brand surface so the
// neon primary, glass secondary and light labels read correctly. `ds-preview`
// forces framer-motion's frozen enter state to its final opaque render.
const Surface: React.FC<{ children: React.ReactNode; column?: boolean; width?: number }> = ({
  children,
  column,
  width,
}) => (
  <div
    className="ds-preview"
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
    <AnimatedButton variant="primary">MAÇA KATIL</AnimatedButton>
    <AnimatedButton variant="secondary">TAKIMI GÖR</AnimatedButton>
    <AnimatedButton variant="danger">İPTAL ET</AnimatedButton>
    <AnimatedButton variant="ghost">DAHA FAZLA</AnimatedButton>
  </Surface>
);

export const Sizes = () => (
  <Surface>
    <AnimatedButton size="sm">KÜÇÜK</AnimatedButton>
    <AnimatedButton size="md">ORTA</AnimatedButton>
    <AnimatedButton size="lg">BÜYÜK</AnimatedButton>
  </Surface>
);

export const States = () => (
  <Surface>
    <AnimatedButton>REZERVE ET</AnimatedButton>
    <AnimatedButton isLoading>REZERVE ET</AnimatedButton>
    <AnimatedButton disabled>REZERVE ET</AnimatedButton>
  </Surface>
);
