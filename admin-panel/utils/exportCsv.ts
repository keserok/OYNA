/** F5.4 PII: IBAN CSV'ye asla ham yazılmaz — ilk 4 + son 4 hane kalır.
 * (Karar #39 e-posta maskesiyle aynı politika; tam IBAN yalnız ekranda,
 * FINANCE yetkili oturumda görünür.) */
export function maskIban(iban: string | null | undefined): string {
  const v = (iban || '').replace(/\s+/g, '');
  if (v.length <= 8) return v ? v[0] + '***' : '';
  return `${v.slice(0, 4)}${'*'.repeat(Math.max(0, v.length - 8))}${v.slice(-4)}`;
}

export function downloadCsv(filename: string, headers: string[], rows: string[][]): void {
  const escape = (cell: string) => {
    const s = String(cell ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))];
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
