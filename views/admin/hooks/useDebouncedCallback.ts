import { useCallback, useEffect, useRef } from 'react';

/** Realtime / poll tetikleyicilerini birleştirir — kasma önler */
export function useDebouncedCallback(fn: () => void, delayMs = 1500): () => void {
  const fnRef = useRef(fn);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  fnRef.current = fn;

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      fnRef.current();
    }, delayMs);
  }, [delayMs]);
}
