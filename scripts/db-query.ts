#!/usr/bin/env node
/**
 * OYNA - Interactive Database Query Tool
 * Supabase veritabanınızda SQL sorguları çalıştırmanızı sağlar
 * 
 * Kullanım:
 *   npx tsx scripts/db-query.ts "SELECT * FROM users LIMIT 5"
 *   npx tsx scripts/db-query.ts --file scripts/db-queries/test-connection.sql
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Hata: VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY .env dosyasında tanımlı olmalı');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function executeQuery(sql: string) {
  console.log('🔍 SQL Sorgusu çalıştırılıyor...\n');
  console.log('───────────────────────────────────────');
  console.log(sql);
  console.log('───────────────────────────────────────\n');

  try {
    const { data, error } = await supabase.rpc('execute_custom_sql', { sql_query: sql });
    
    if (error) {
      console.error('❌ Hata:', error.message);
      return;
    }

    console.log('✅ Sorgu başarılı!\n');
    console.log('📊 Sonuçlar:', JSON.stringify(data, null, 2));
  } catch (err: any) {
    console.error('❌ Beklenmeyen hata:', err.message);
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║        OYNA - Interactive Database Query Tool             ║
╚═══════════════════════════════════════════════════════════╝

Kullanım:
  npx tsx scripts/db-query.ts "SQL_SORGUNUZ"
  npx tsx scripts/db-query.ts --file scripts/db-queries/dosya.sql

Örnekler:
  npx tsx scripts/db-query.ts "SELECT COUNT(*) FROM users"
  npx tsx scripts/db-query.ts "SELECT * FROM matches WHERE status='OPEN' LIMIT 5"
  npx tsx scripts/db-query.ts --file scripts/db-queries/test-connection.sql

Not: Bu tool sadece SELECT sorguları için önerilir.
     Schema değişiklikleri için migration kullanın.
    `);
    return;
  }

  if (args[0] === '--file' || args[0] === '-f') {
    const filePath = args[1];
    if (!filePath) {
      console.error('❌ Dosya yolu belirtilmedi');
      return;
    }
    
    const fullPath = path.resolve(filePath);
    if (!fs.existsSync(fullPath)) {
      console.error(`❌ Dosya bulunamadı: ${fullPath}`);
      return;
    }
    
    const sql = fs.readFileSync(fullPath, 'utf-8');
    await executeQuery(sql);
  } else {
    const sql = args.join(' ');
    await executeQuery(sql);
  }
}

main();
