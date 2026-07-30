import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RoleSwitcher from '../../../components/RoleSwitcher';
import { useAppStore } from '../../../store';
import { setActiveRole } from '../../../services/userService';

describe('RoleSwitcher Component', () => {
  const mockOnClose = vi.fn();
  const mockOnSwitched = vi.fn();
  const availableRoles = ['PLAYER', 'GOALKEEPER'];

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset global mocked store state
    const store = useAppStore() as any;
    store.role = 'PLAYER';
    store.myRoles = ['PLAYER', 'GOALKEEPER'];
  });

  it('renders available roles correctly', () => {
    render(<RoleSwitcher roles={availableRoles} onClose={mockOnClose} onSwitched={mockOnSwitched} />);

    expect(screen.getByText('Rol Değiştir')).toBeInTheDocument();
    
    // Check buttons for PLAYER and GOALKEEPER are rendered
    expect(screen.getByText('Oyuncu')).toBeInTheDocument();
    expect(screen.getByText('Kaleci')).toBeInTheDocument();

    // Check active status indicator
    expect(screen.getByText('Aktif')).toBeInTheDocument();
  });

  it('opens confirmation modal when another role is clicked', () => {
    render(<RoleSwitcher roles={availableRoles} onClose={mockOnClose} onSwitched={mockOnSwitched} />);

    // Click 'Kaleci'
    const gkBtn = screen.getByText('Kaleci').closest('button');
    expect(gkBtn).toBeInTheDocument();
    fireEvent.click(gkBtn!);

    // Confirmation dialog should appear
    expect(screen.getByText('Rol Değişikliği')).toBeInTheDocument();
    // Onay metni 'Kaleci' kısmı <span> içinde render edilir; combined textContent'ı kontrol et
    const matches = screen.getAllByText((_content, element) => {
      const tag = element?.tagName?.toLowerCase();
      // Sadece <p> tag'ine bak — span + text node birleşimini barındıran element
      if (tag !== 'p') return false;
      const text = element?.textContent ?? '';
      return /Kaleci.*rolüne geçmek istediğine emin misin\?/s.test(text);
    });
    expect(matches.length).toBeGreaterThan(0);
    expect(screen.getByText('Rolü Değiştir')).toBeInTheDocument();
    expect(screen.getByText('Vazgeç')).toBeInTheDocument();
  });

  it('performs role switch successfully when confirmed', async () => {
    // Mock successful service call
    vi.mocked(setActiveRole).mockResolvedValueOnce(true);

    render(<RoleSwitcher roles={availableRoles} onClose={mockOnClose} onSwitched={mockOnSwitched} />);

    // Click 'Kaleci'
    const gkBtn = screen.getByText('Kaleci').closest('button');
    fireEvent.click(gkBtn!);

    // Confirm change
    const confirmBtn = screen.getByText('Rolü Değiştir');
    fireEvent.click(confirmBtn);

    // Should call service and trigger callbacks
    await waitFor(() => {
      expect(setActiveRole).toHaveBeenCalledWith('GOALKEEPER');
      expect(mockOnSwitched).toHaveBeenCalledWith('GOALKEEPER', 'SERVICE_DASHBOARD');
      expect(useAppStore().role).toBe('GOALKEEPER');
    });
  });

  it('displays error message when service call fails', async () => {
    // Mock failed service call
    vi.mocked(setActiveRole).mockResolvedValueOnce(false);

    render(<RoleSwitcher roles={availableRoles} onClose={mockOnClose} onSwitched={mockOnSwitched} />);

    // Click 'Kaleci'
    const gkBtn = screen.getByText('Kaleci').closest('button');
    fireEvent.click(gkBtn!);

    // Confirm change
    const confirmBtn = screen.getByText('Rolü Değiştir');
    fireEvent.click(confirmBtn);

    // Confirmation dialog closes and error appears
    await waitFor(() => {
      expect(screen.getByText('Rol değiştirilemedi. Lütfen tekrar dene.')).toBeInTheDocument();
    });
  });
});
