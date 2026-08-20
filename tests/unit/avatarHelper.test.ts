import { describe, it, expect } from 'vitest';
import {
  getInitials,
  isDefaultAvatar,
} from '../../utils/avatarHelper';

// ─── isDefaultAvatar ──────────────────────────────────────────────────────────

describe('isDefaultAvatar', () => {
  it('null/undefined/boş string → true', () => {
    expect(isDefaultAvatar(null)).toBe(true);
    expect(isDefaultAvatar(undefined)).toBe(true);
    expect(isDefaultAvatar('')).toBe(true);
  });

  it('yalnız boşluklar → true (.trim() === "")', () => {
    expect(isDefaultAvatar('   ')).toBe(true);
  });

  it('dicebear URL → true', () => {
    expect(isDefaultAvatar('https://api.dicebear.com/7.x/avataaars/svg?seed=abc')).toBe(true);
    // büyük-küçük harf duyarsız olmalı
    expect(isDefaultAvatar('https://API.DICEBEAR.COM/something')).toBe(true);
  });

  it('pravatar.cc URL → true', () => {
    expect(isDefaultAvatar('https://i.pravatar.cc/150?u=xyz')).toBe(true);
  });

  it('picsum.photos URL → true', () => {
    expect(isDefaultAvatar('https://picsum.photos/200')).toBe(true);
  });

  it('ui-avatars URL → true (demo hesaplardaki mavi disk buradan geliyordu)', () => {
    // Kurucu kararı (20 Ağu 2026): üreteç PNG'sinin gömülü zemini saydamlık
    // kuralını deler; böyle adresler fotoğraf sayılmaz, baş harf yedeği çizilir.
    expect(isDefaultAvatar('https://ui-avatars.com/api/?background=0D8ABC&color=fff&name=Ali')).toBe(true);
    expect(isDefaultAvatar('https://UI-AVATARS.COM/api/?name=X')).toBe(true);
  });

  it('yerel baş harf SVG data-URI → true (fotoğraf değildir)', () => {
    expect(isDefaultAvatar('data:image/svg+xml;utf8,%3Csvg%3E')).toBe(true);
  });

  it('gerçek Supabase Storage URL → false', () => {
    const realUrl = 'https://xyz.supabase.co/storage/v1/object/public/avatars/user.jpg';
    expect(isDefaultAvatar(realUrl)).toBe(false);
  });

  it('rastgele dış URL → false', () => {
    expect(isDefaultAvatar('https://example.com/photo.jpg')).toBe(false);
  });
});

// ─── getInitials ──────────────────────────────────────────────────────────────

describe('getInitials', () => {
  it('boş string → "?"', () => {
    expect(getInitials('')).toBe('?');
  });

  it('tek kelime → ilk harf büyük', () => {
    expect(getInitials('kerem')).toBe('K');
    expect(getInitials('Ali')).toBe('A');
  });

  it('iki kelime → her kelimeden ilk harf', () => {
    expect(getInitials('Kerem Serok')).toBe('KS');
    expect(getInitials('ali veli')).toBe('AV');
  });

  it('üç kelime → ilk ve son harfler alınır', () => {
    // "Ali Rıza Kaya" → "AK"
    expect(getInitials('Ali Rıza Kaya')).toBe('AK');
  });

  it('parantez eklerini atar — "(Sen)" ve "(Kaptan)"', () => {
    expect(getInitials('Ahmet (Sen)')).toBe('A');
    expect(getInitials('Kerem Serok (Kaptan)')).toBe('KS');
  });

  it('birden fazla boşluk kabul eder', () => {
    expect(getInitials('Ali   Veli')).toBe('AV');
  });

  it('Türkçe karakterler büyütülür doğru', () => {
    // İ, Ş, Ç, Ğ, Ü, Ö
    expect(getInitials('şafak öz')).toBe('ŞÖ');
  });

  it('yalnız parantez içerik → temizlenince "?" döner', () => {
    expect(getInitials('(Sen)')).toBe('?');
  });
});
