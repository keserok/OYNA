import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import OfflineBanner from '../../components/OfflineBanner';
import React from 'react';

describe('OfflineBanner', () => {
  it('online iken hiçbir şey render etmez', () => {
    Object.defineProperty(window.navigator, 'onLine', {
      value: true,
      writable: true,
    });

    const { container } = render(<OfflineBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('offline iken uyarı mesajını render eder', () => {
    Object.defineProperty(window.navigator, 'onLine', {
      value: false,
      writable: true,
    });

    render(<OfflineBanner />);
    expect(screen.getByText(/İnternet bağlantısı yok/i)).toBeInTheDocument();
  });

  it('online -> offline ve offline -> online geçişlerini dinler', () => {
    Object.defineProperty(window.navigator, 'onLine', {
      value: true,
      writable: true,
    });

    const { container } = render(<OfflineBanner />);
    expect(container.firstChild).toBeNull();

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByText(/İnternet bağlantısı yok/i)).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.queryByText(/İnternet bağlantısı yok/i)).not.toBeInTheDocument();
  });
});
