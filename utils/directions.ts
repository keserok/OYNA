// Yol tarifi — platform-farkındalıklı deep link'ler.
// iOS: kullanıcı Apple Maps / Google Maps seçebilsin (UI seçici gösterir).
// Android/Web: doğrudan Google Maps.
import { Capacitor } from '@capacitor/core';

export const isIOSPlatform = (): boolean => Capacitor.getPlatform() === 'ios';

export const googleMapsDirectionsUrl = (lat: number, lng: number): string =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

export const appleMapsDirectionsUrl = (lat: number, lng: number, label?: string): string =>
  `https://maps.apple.com/?daddr=${lat},${lng}${label ? `&q=${encodeURIComponent(label)}` : ''}`;

/** Android/Web: Google'ı doğrudan aç. iOS'ta çağıran taraf seçici göstermeli. */
export const openDirections = (lat: number, lng: number): void => {
  window.open(googleMapsDirectionsUrl(lat, lng), '_blank', 'noreferrer');
};

/** Serbest metin (saha adı/adres) ile yol tarifi — koordinat yoksa kullanılır.
 *  Denetim bulgusu 25: aynı iş uygulamanın iki yerinde farklı davranıyordu. */
export const openDirectionsByQuery = (query: string): void => {
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
};
