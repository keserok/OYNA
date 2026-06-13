#!/usr/bin/env node
/**
 * OYNA - Test Data Seeding
 * Development ve test için örnek veri oluşturur
 * 
 * UYARI: Bu script SADECE development/test ortamında çalıştırılmalıdır!
 * 
 * Kullanım: npx tsx scripts/seeds/seed-all.ts
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ .env dosyası eksik');
  process.exit(1);
}

// Production kontrolü
if (SUPABASE_URL.includes('iikvzgyccvgcybzdfwlv') && process.env.ALLOW_PRODUCTION_SEED !== 'true') {
  console.error('❌ UYARI: Production veritabanında seed çalıştırılamaz!');
  console.error('   Devam etmek için ALLOW_PRODUCTION_SEED=true ayarlayın (ÖNERİLMEZ)');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function seedUsers() {
  console.log('\n👥 Test kullanıcıları oluşturuluyor...');
  
  const testUsers = [
    {
      name: 'Ahmet Yılmaz',
      email: 'ahmet@test.com',
      role: 'PLAYER',
      rating: 4.2,
      matchCount: 15
    },
    {
      name: 'Mehmet Demir',
      email: 'mehmet@test.com',
      role: 'GOALKEEPER',
      rating: 4.5,
      matchCount: 20
    },
    {
      name: 'Ayşe Kaya',
      email: 'ayse@test.com',
      role: 'PLAYER',
      rating: 4.0,
      matchCount: 12
    }
  ];

  // Note: Bu sadece örnek. Gerçek implementasyon auth.users ile senkronize olmalı
  console.log('   Test users:', testUsers.length);
  console.log('   ⚠️  Not: User seeding için admin access gerekli');
}

async function seedMatches() {
  console.log('\n⚽ Test maçları oluşturuluyor...');
  
  const testMatches = [
    {
      title: 'Halı Saha Maçı - Kadıköy',
      location: 'Kadıköy Spor Kompleksi',
      date: new Date().toISOString().split('T')[0],
      time: '19:00',
      price: 50,
      difficulty: 'ORTA',
      status: 'OPEN'
    }
  ];

  console.log('   Test matches:', testMatches.length);
  console.log('   ✅ Seed template hazır');
}

async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║     OYNA - Test Data Seeding Tool                         ║
╚═══════════════════════════════════════════════════════════╝

Hedef Veritabanı: ${SUPABASE_URL}
Mod: ${process.env.NODE_ENV || 'development'}
  `);

  console.log('⚠️  UYARI: Bu işlem veritabanınıza test verisi ekler.');
  console.log('   Production ortamında çalıştırmayın!\n');

  await seedUsers();
  await seedMatches();

  console.log('\n✅ Seed işlemi tamamlandı (şablon)');
  console.log('\n📝 Gerçek seed implementasyonu için:');
  console.log('   1. Auth user oluşturma mekanizması ekleyin');
  console.log('   2. Foreign key ilişkilerini doğru kurun');
  console.log('   3. RLS policy\'lerine uygun veri ekleyin\n');
}

main();
