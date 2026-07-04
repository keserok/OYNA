// OYNA — Admin edge fonksiyonları için paylaşılan Origin + IP allowlist kapısı
// (Kararlar Soru 26, 33). TAMAMEN DORMANT: ilgili env değişkeni set edilmeden
// hiçbir kısıt uygulanmaz — mevcut davranış aynen korunur. Sen aşağıdaki
// secret'ları set edince otomatik devreye girer:
//
//   supabase secrets set ADMIN_ALLOWED_ORIGIN="https://admin.oyna.app"
//   supabase secrets set ADMIN_IP_ALLOWLIST="1.2.3.4,10.0.0.0/24"
//
// ADMIN_ALLOWED_ORIGIN virgülle çoklu olabilir. ADMIN_IP_ALLOWLIST tam IPv4
// veya IPv4 CIDR (/8../32) kabul eder. Webhook'larda kullanılMAZ (imzaya güvenilir).

export function buildCorsHeaders(req: Request): Record<string, string> {
  const allowed = (Deno.env.get('ADMIN_ALLOWED_ORIGIN') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const origin = req.headers.get('origin') ?? '';
  // Env boşsa eski davranış ('*'); doluysa yalnız izinli origin yansıtılır.
  const allowOrigin = allowed.length === 0 ? '*' : (allowed.includes(origin) ? origin : allowed[0]);
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-secret',
    'Vary': 'Origin',
  };
}

/** Origin izinli mi? Env boşsa daima true (dormant). */
export function isOriginAllowed(req: Request): boolean {
  const allowed = (Deno.env.get('ADMIN_ALLOWED_ORIGIN') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (allowed.length === 0) return true;
  const origin = req.headers.get('origin') ?? '';
  // Origin başlığı yoksa (sunucu-sunucu / curl) origin kısıtı uygulanmaz; IP kısıtı devrede.
  if (!origin) return true;
  return allowed.includes(origin);
}

/** İstemci IP'sini x-forwarded-for zincirinden çıkar (ilk = gerçek istemci). */
export function clientIp(req: Request): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip');
}

function ipToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const o = Number(p);
    if (!Number.isInteger(o) || o < 0 || o > 255) return null;
    n = (n << 8) | o;
  }
  return n >>> 0;
}

function ipInCidr(ip: string, cidr: string): boolean {
  const [base, bitsRaw] = cidr.split('/');
  const bits = bitsRaw === undefined ? 32 : Number(bitsRaw);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const ipInt = ipToInt(ip);
  const baseInt = ipToInt(base);
  if (ipInt === null || baseInt === null) return false;
  if (bits === 0) return true;
  const mask = bits === 32 ? 0xffffffff : (~((1 << (32 - bits)) - 1)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

/** IP izinli mi? Env boşsa daima true (dormant); IP çözülemezse fail-closed reddeder. */
export function isIpAllowed(req: Request): boolean {
  const list = (Deno.env.get('ADMIN_IP_ALLOWLIST') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (list.length === 0) return true;
  const ip = clientIp(req);
  if (!ip) return false; // allowlist aktifken IP okunamıyorsa güvenli tarafta reddet
  return list.some((entry) => entry.includes('/') ? ipInCidr(ip, entry) : entry === ip);
}

/**
 * Admin edge fonksiyonlarının başında çağır. Kısıt ihlali varsa 403 Response
 * döndürür (fonksiyon onu döndürüp erken çıkmalı); sorun yoksa null döner.
 */
export function enforceAdminNetworkPolicy(req: Request, cors: Record<string, string>): Response | null {
  if (!isOriginAllowed(req)) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
  if (!isIpAllowed(req)) {
    return new Response(JSON.stringify({ error: 'IP not allowed' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
  return null;
}
