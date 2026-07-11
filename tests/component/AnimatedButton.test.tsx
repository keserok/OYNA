import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AnimatedButton } from '../../components/AnimatedButton';
import React from 'react';

describe('AnimatedButton', () => {
  it('children içeriğini render eder', () => {
    render(<AnimatedButton>Tıkla</AnimatedButton>);
    expect(screen.getByText('Tıkla')).toBeInTheDocument();
  });

  it('tıklandığında onClick handler çağırır', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<AnimatedButton onClick={onClick}>Tıkla</AnimatedButton>);

    const button = screen.getByRole('button', { name: 'Tıkla' });
    await user.click(button);

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('disabled iken tıklanamaz', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<AnimatedButton disabled onClick={onClick}>Tıkla</AnimatedButton>);

    const button = screen.getByRole('button', { name: 'Tıkla' });
    expect(button).toBeDisabled();

    // user.click internally checks if the button is disabled and throws/doesn't click,
    // but just to be sure we also assert onClick isn't called.
    try {
      await user.click(button);
    } catch (e) {
      // ignore
    }
    expect(onClick).not.toHaveBeenCalled();
  });

  it('isLoading iken spinner ve Yükleniyor yazısını render eder', () => {
    render(<AnimatedButton isLoading>Tıkla</AnimatedButton>);
    expect(screen.getByText('Yükleniyor')).toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');
  });

  it('as="div" olduğunda div elementi olarak render eder', () => {
    render(<AnimatedButton as="div">Kutu</AnimatedButton>);
    const element = screen.getByRole('button');
    expect(element.tagName).toBe('DIV');
  });
});
