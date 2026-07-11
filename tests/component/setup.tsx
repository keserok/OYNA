import '@testing-library/jest-dom';
import { vi } from 'vitest';
import React from 'react';

// Mock framer-motion to avoid JSDOM errors with requestAnimationFrame, CSS transitions, and SVG rendering
vi.mock('framer-motion', async (importOriginal) => {
  const original = await importOriginal<typeof import('framer-motion')>();
  return {
    ...original,
    motion: {
      div: React.forwardRef(({ children, whileTap, whileHover, animate, initial, transition, layoutId, ...props }: any, ref: any) => (
        <div ref={ref} {...props}>{children}</div>
      )),
      button: React.forwardRef(({ children, whileTap, whileHover, animate, initial, transition, layoutId, ...props }: any, ref: any) => (
        <button ref={ref} {...props}>{children}</button>
      )),
      nav: React.forwardRef(({ children, whileTap, whileHover, animate, initial, transition, layoutId, ...props }: any, ref: any) => (
        <nav ref={ref} {...props}>{children}</nav>
      )),
      span: React.forwardRef(({ children, whileTap, whileHover, animate, initial, transition, layoutId, ...props }: any, ref: any) => (
        <span ref={ref} {...props}>{children}</span>
      )),
    },
    AnimatePresence: ({ children }: any) => <>{children}</>,
  };
});

// Mock window.navigator.vibrate
if (typeof window !== 'undefined' && window.navigator) {
  window.navigator.vibrate = vi.fn();
}
