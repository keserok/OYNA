#!/usr/bin/env node
/**
 * OYNA - RLS Policy Generator
 * Row Level Security policy'leri oluşturmanıza yardımcı olur
 * 
 * Kullanım: npx tsx scripts/generate-rls-policy.ts
 */

import * as readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query: string): Promise<string> {
  return new Promise((resolve) => rl.question(query, resolve));
}

const policyTemplates = {
  'select-public': (table: string) => `
-- Public read access for ${table}
DROP POLICY IF EXISTS "${table}_public_select" ON public.${table};
CREATE POLICY "${table}_public_select" 
  ON public.${table}
  FOR SELECT 
  USING (true);
`,

  'select-authenticated': (table: string) => `
-- Authenticated users can read ${table}
DROP POLICY IF EXISTS "${table}_authenticated_select" ON public.${table};
CREATE POLICY "${table}_authenticated_select" 
  ON public.${table}
  FOR SELECT 
  USING (auth.role() = 'authenticated');
`,

  'insert-own': (table: string, idColumn: string) => `
-- Users can insert their own ${table}
DROP POLICY IF EXISTS "${table}_insert_own" ON public.${table};
CREATE POLICY "${table}_insert_own" 
  ON public.${table}
  FOR INSERT 
  WITH CHECK (auth.uid() = ${idColumn});
`,

  'update-own': (table: string, idColumn: string) => `
-- Users can update their own ${table}
DROP POLICY IF EXISTS "${table}_update_own" ON public.${table};
CREATE POLICY "${table}_update_own" 
  ON public.${table}
  FOR UPDATE 
  USING (auth.uid() = ${idColumn});
`,

  'delete-admin': (table: string) => `
-- Only admins can delete ${table}
DROP POLICY IF EXISTS "${table}_delete_admin" ON public.${table};
CREATE POLICY "${table}_delete_admin" 
  ON public.${table}
  FOR DELETE 
  USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) IN ('ADMIN', 'SUPER_ADMIN')
  );
`
};

async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║        OYNA - RLS Policy Generator                        ║
╚═══════════════════════════════════════════════════════════╝
  `);

  const table = await question('Tablo adı (örn: matches): ');
  if (!table) {
    console.log('❌ Tablo adı gerekli');
    rl.close();
    return;
  }

  console.log('\nPolicy tipi seçin:');
  console.log('1. Public Read (herkes okuyabilir)');
  console.log('2. Authenticated Read (sadece giriş yapanlar)');
  console.log('3. Insert Own (kullanıcı kendi kaydını ekler)');
  console.log('4. Update Own (kullanıcı kendi kaydını günceller)');
  console.log('5. Delete Admin (sadece admin siler)');

  const choice = await question('\nSeçim (1-5): ');

  let sql = '';
  
  switch(choice) {
    case '1':
      sql = policyTemplates['select-public'](table);
      break;
    case '2':
      sql = policyTemplates['select-authenticated'](table);
      break;
    case '3':
      const insertIdCol = await question('ID kolonu adı (örn: user_id): ');
      sql = policyTemplates['insert-own'](table, insertIdCol || 'id');
      break;
    case '4':
      const updateIdCol = await question('ID kolonu adı (örn: user_id): ');
      sql = policyTemplates['update-own'](table, updateIdCol || 'id');
      break;
    case '5':
      sql = policyTemplates['delete-admin'](table);
      break;
    default:
      console.log('❌ Geçersiz seçim');
      rl.close();
      return;
  }

  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║ Oluşturulan RLS Policy SQL                                ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log(sql);
  console.log("\n✅ Bu SQL'i bir migration dosyasına ekleyebilirsiniz.");
  console.log('   ./scripts/migrations/create-migration.sh ile migration oluşturun.');

  rl.close();
}

main();
