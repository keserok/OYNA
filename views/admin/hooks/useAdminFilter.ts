import { useMemo, useState } from 'react';
import { useDebouncedValue } from './useDebouncedValue';

export function useAdminFilter<T>(
  items: T[],
  searchFn: (item: T, query: string) => boolean,
  initialQuery = '',
) {
  const [query, setQuery] = useState(initialQuery);
  const debouncedQuery = useDebouncedValue(query, 300);

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => searchFn(item, q));
  }, [items, debouncedQuery, searchFn]);

  return { query, setQuery, filtered, clear: () => setQuery('') };
}
