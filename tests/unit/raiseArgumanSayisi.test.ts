/**
 * RAISE ARGÜMAN SAYISI — göç dosyalarının tamamı taranır.
 *
 * NİYE VAR (19 Ağustos 2026): `20260911000000` içinde şu satır vardı:
 *
 *     RAISE EXCEPTION 'DOGRULAMA: %% oraninda ... uretildi', v_pct;
 *
 * PL/pgSQL'de `%%` LİTERAL yüzde işaretidir — yani bu metinde yer tutucu YOK
 * ama bir argüman veriliyor. PostgreSQL bunu ÇALIŞMA anında değil, DERLEME
 * anında reddeder:
 *
 *     ERROR: 42601: too many parameters specified for RAISE
 *     CONTEXT: compilation of PL/pgSQL function ... near line 4
 *
 * Yani dal hiç çalışmasa bile göç patlar. Canlıya elle uygulanan metinde bu
 * satır yoktu; hatayı sıfırdan kurulan Supabase önizleme dalı yakaladı — yani
 * hata YALNIZCA temiz bir kurulumda ortaya çıkıyordu: yeni bir ortam kurmaya
 * çalışan herkes için göç zinciri orada kilitlenirdi.
 *
 * Bu test o sınıfı topluca kapatır: yer tutucu sayısı ile argüman sayısı
 * uyuşmayan HİÇBİR RAISE depoya giremez.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const KOK = join(process.cwd(), 'supabase/migrations');

/** `%s`/`%I`/`%L` yok — PL/pgSQL RAISE yalnız `%` kullanır, `%%` literaldir. */
const yerTutucuSay = (bicim: string): number => {
  let n = 0;
  for (let i = 0; i < bicim.length; i++) {
    if (bicim[i] !== '%') continue;
    if (bicim[i + 1] === '%') { i++; continue; }  // literal yüzde — atla
    n++;
  }
  return n;
};

/**
 * Argümanları en üst düzey virgüllere göre ayır. Argümanın kendisi virgül
 * içerebilir (`format(...)`, `jsonb_build_object(a, b)`) — parantez ve tırnak
 * derinliği sayılmazsa bu test kendi yanlış alarmını üretir.
 */
const argumanSay = (kuyruk: string): number => {
  let derinlik = 0, tirnak = false, adet = 1;
  for (let i = 0; i < kuyruk.length; i++) {
    const c = kuyruk[i];
    if (tirnak) {
      if (c === "'") { if (kuyruk[i + 1] === "'") i++; else tirnak = false; }
      continue;
    }
    if (c === "'") { tirnak = true; continue; }
    if (c === '(' || c === '[') derinlik++;
    else if (c === ')' || c === ']') derinlik--;
    else if (c === ',' && derinlik === 0) adet++;
  }
  return adet;
};

type Bulgu = { dosya: string; satir: number; metin: string; yer: number; arg: number };

const tara = (): Bulgu[] => {
  const bulgular: Bulgu[] = [];
  for (const dosya of readdirSync(KOK).filter((f) => f.endsWith('.sql'))) {
    const satirlar = readFileSync(join(KOK, dosya), 'utf8').split('\n');
    satirlar.forEach((satir, i) => {
      // Tek satırda kapanan RAISE'ler: 'biçim' [, argümanlar] ;
      const m = satir.match(/RAISE\s+(?:EXCEPTION|NOTICE|WARNING|LOG|INFO|DEBUG)\s+'((?:[^']|'')*)'\s*(,[^;]*)?;/i);
      if (!m) return;
      const yer = yerTutucuSay(m[1]);
      const arg = m[2] ? argumanSay(m[2].slice(1).trim()) : 0;
      // USING ... yan tümcesi argüman değildir; onu taşıyan satırları atla.
      if (m[2] && /\bUSING\b/i.test(m[2])) return;
      if (yer !== arg) {
        bulgular.push({ dosya, satir: i + 1, metin: satir.trim(), yer, arg });
      }
    });
  }
  return bulgular;
};

describe('Göç dosyaları · RAISE yer tutucu/argüman dengesi', () => {
  it('hiçbir RAISE fazla ya da eksik argüman almıyor', () => {
    const bulgular = tara();
    const rapor = bulgular
      .map((b) => `${b.dosya}:${b.satir} — ${b.yer} yer tutucu, ${b.arg} argüman\n    ${b.metin}`)
      .join('\n');
    expect(bulgular, `PL/pgSQL bunu DERLEME anında reddeder; göç temiz bir kurulumda patlar:\n${rapor}`)
      .toEqual([]);
  });

  it('tarayıcının kendisi çalışıyor — `%%` literal sayılıyor', () => {
    expect(yerTutucuSay('yuzde %% oran')).toBe(0);
    expect(yerTutucuSay('yuzde % oran')).toBe(1);
    expect(yerTutucuSay('%% ve % ve %')).toBe(2);
  });

  it('tarayıcı iç virgülleri argüman sanmıyor', () => {
    expect(argumanSay('jsonb_build_object(a, b)')).toBe(1);
    expect(argumanSay("v_a, format('x, y')")).toBe(2);
  });
});
