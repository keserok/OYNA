// Tek kaynak: gerçek build sürümü (package.json → vite.config.ts define → burada).
// Ayarlar ekranlarındaki sürüm rozetleri farklı, elle yazılmış değerler göstermesin diye
// tüm ekranlar bu sabiti kullanmalı.
export const APP_VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined) || '0.0.0';
