import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Avatar from '../../../components/ui/Avatar';

describe('Avatar Component', () => {
  it('renders image when src is provided and loads successfully', () => {
    render(<Avatar name="Ali Yılmaz" src="https://example.com/avatar.jpg" />);
    
    const img = screen.getByRole('img');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://example.com/avatar.jpg');
    expect(img).toHaveAttribute('alt', 'Ali Yılmaz');
  });

  it('falls back to initials when src is missing', () => {
    render(<Avatar name="Ali Yılmaz" src={null} />);
    
    const initials = screen.getByText('AY');
    expect(initials).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('falls back to initials when image loading fails', () => {
    render(<Avatar name="Ahmet Şahin" src="https://example.com/broken.jpg" />);
    
    const img = screen.getByRole('img');
    expect(img).toBeInTheDocument();
    
    // Simulate image error event
    fireEvent.error(img);
    
    // It should now render initials instead of img
    const initials = screen.getByText('AŞ');
    expect(initials).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders online badge when online prop is true', () => {
    render(<Avatar name="Can" src={null} online={true} />);
    
    const badge = screen.getByLabelText('Çevrimiçi');
    expect(badge).toBeInTheDocument();
  });

  it('does not render online badge when online prop is false or undefined', () => {
    const { rerender } = render(<Avatar name="Can" src={null} online={false} />);
    expect(screen.queryByLabelText('Çevrimiçi')).not.toBeInTheDocument();
    
    rerender(<Avatar name="Can" src={null} online={null} />);
    expect(screen.queryByLabelText('Çevrimiçi')).not.toBeInTheDocument();
  });

  it('applies correct class names for different sizes', () => {
    const { rerender } = render(<Avatar name="Test" size="sm" />);
    let initialsContainer = screen.getByText('T').parentElement;
    expect(initialsContainer).toHaveClass('w-8 h-8');

    rerender(<Avatar name="Test" size="xl" />);
    initialsContainer = screen.getByText('T').parentElement;
    expect(initialsContainer).toHaveClass('w-20 h-20');
  });
});
