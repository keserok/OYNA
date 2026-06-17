import { supabase } from '../supabaseClient';

/** Standalone Godview → consumer app ghost mode deep link */
export function buildGhostDeepLink(userId: string, userName?: string): string {
  const base = import.meta.env.VITE_APP_URL || window.location.origin.replace('/admin.html', '');
  const params = new URLSearchParams({
    ghost: userId,
    ...(userName ? { name: userName } : {}),
  });
  return `${base}/?${params.toString()}`;
}

export function openGhostInConsumerApp(userId: string, userName?: string): void {
  const url = buildGhostDeepLink(userId, userName);
  window.open(url, '_blank', 'noopener,noreferrer');
}
