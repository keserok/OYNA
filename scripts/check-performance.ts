#!/usr/bin/env node
/**
 * OYNA - Database Performance Advisor
 * Veritabanı performans önerilerini MCP üzerinden alır
 * 
 * Kullanım: npx tsx scripts/check-performance.ts
 */

console.log(`
╔═══════════════════════════════════════════════════════════╗
║     OYNA - Database Performance Check                     ║
╚═══════════════════════════════════════════════════════════╝

Veritabanı performans önerileri için Supabase MCP server kullanılıyor...

MCP tool çağrısı:
  Server: plugin-supabase-supabase
  Tool: get_advisors
  Project: iikvzgyccvgcybzdfwlv

Bu tool'u Cursor Agent modu ile çalıştırabilirsiniz.
Agent'a şunu söyleyin: "Veritabanı performansını kontrol et"
`);

console.log('💡 Performans önerileri için şunları kontrol edebilirsiniz:');
console.log('   - Index eksiklikleri');
console.log('   - Yavaş sorgular');
console.log('   - Güvenlik açıkları');
console.log('   - RLS policy optimizasyonları\n');
