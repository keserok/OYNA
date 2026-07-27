// OYNA yerel Supabase geçidi — tek origin (http://127.0.0.1:54321) altında:
//   /auth/v1/*      → GoTrue yerine geçen küçük kimlik sunucusu (bu dosya)
//   /rest/v1/*      → PostgREST (aynı JWT sırrı)
//   /storage/v1/*   → yer tutucu görsel
//   /realtime/v1    → kapalı (uygulama yeniden dener, ekran görüntüsünü etkilemez)
//
// Yalnızca kılavuz ekran görüntüsü içindir; üretimle ilgisi yoktur.
import http from 'node:http';
import crypto from 'node:crypto';
import { Client } from 'pg';

const PORT = Number(process.env.GATEWAY_PORT || 54321);
const PGRST = process.env.PGRST_URL || 'http://127.0.0.1:3001';
const DB_URL = process.env.DB_URL || 'postgresql://postgres@127.0.0.1:55432/oyna';
const JWT_SECRET = process.env.JWT_SECRET || 'oyna-local-screenshot-secret-min-32-characters';

// ───────────────────────────────────────────────────────────────── JWT ──────
const b64u = (buf) => Buffer.from(buf).toString('base64url');

function signJwt(payload, ttlSec = 3600) {
  const now = Math.floor(Date.now() / 1000);
  const body = { iss: 'oyna-local', aud: 'authenticated', iat: now, exp: now + ttlSec, ...payload };
  const head = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const data = `${head}.${b64u(JSON.stringify(body))}`;
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export const ANON_KEY = signJwt({ role: 'anon' }, 60 * 60 * 24 * 365);

// ────────────────────────────────────────────────────────────── veritabanı ──
const db = new Client({ connectionString: DB_URL });
await db.connect();

async function findUser(email) {
  const { rows } = await db.query(
    `select id, email, raw_user_meta_data, raw_app_meta_data, created_at, encrypted_password
       from auth.users where lower(email) = lower($1) limit 1`, [email]);
  return rows[0] || null;
}

async function findUserById(id) {
  const { rows } = await db.query(
    `select id, email, raw_user_meta_data, raw_app_meta_data, created_at
       from auth.users where id = $1 limit 1`, [id]);
  return rows[0] || null;
}

async function passwordMatches(email, password) {
  const { rows } = await db.query(
    `select (encrypted_password = extensions.crypt($2, encrypted_password)) as ok
       from auth.users where lower(email) = lower($1) limit 1`, [email, password]);
  return rows[0]?.ok === true;
}

const userPayload = (u) => ({
  id: u.id,
  aud: 'authenticated',
  role: 'authenticated',
  email: u.email,
  email_confirmed_at: u.created_at,
  phone: '',
  confirmed_at: u.created_at,
  last_sign_in_at: new Date().toISOString(),
  app_metadata: u.raw_app_meta_data || { provider: 'email', providers: ['email'] },
  user_metadata: u.raw_user_meta_data || {},
  identities: [],
  created_at: u.created_at,
  updated_at: u.created_at,
  is_anonymous: false,
});

function sessionFor(u) {
  const access_token = signJwt({
    sub: u.id, email: u.email, role: 'authenticated', aal: 'aal1',
    session_id: crypto.randomUUID(),
    user_metadata: u.raw_user_meta_data || {},
    app_metadata: u.raw_app_meta_data || { provider: 'email', providers: ['email'] },
  });
  return {
    access_token,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: `local-${u.id}`,
    user: userPayload(u),
  };
}

// ────────────────────────────────────────────────────────────── yardımcılar ─
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD',
  'Access-Control-Expose-Headers': 'content-range,content-location,x-total-count',
  'Access-Control-Max-Age': '86400',
};

const send = (res, code, obj, extra = {}) => {
  const body = typeof obj === 'string' ? obj : JSON.stringify(obj);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', ...CORS, ...extra });
  res.end(body);
};

const readBody = (req) => new Promise((resolve) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); } });
});

// Basit yer tutucu avatar (storage isteklerine kırık görsel dönmesin diye)
const placeholderSvg = (seed = 'oyna') => {
  const hue = [...seed].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
    <rect width="200" height="200" fill="hsl(${hue},45%,28%)"/>
    <circle cx="100" cy="78" r="34" fill="hsl(${hue},40%,60%)"/>
    <ellipse cx="100" cy="170" rx="58" ry="44" fill="hsl(${hue},40%,60%)"/>
  </svg>`;
};

// ───────────────────────────────────────────────────────── auth yönlendirme ─
async function handleAuth(req, res, url) {
  const p = url.pathname.replace(/^\/auth\/v1/, '') || '/';

  if (p === '/health' || p === '/settings') {
    return send(res, 200, p === '/health'
      ? { date: new Date().toISOString(), description: 'oyna local auth stub' }
      : { external: { email: true }, disable_signup: false, mailer_autoconfirm: true });
  }

  if (p === '/token') {
    const grant = url.searchParams.get('grant_type');
    const body = await readBody(req);

    if (grant === 'refresh_token') {
      const id = String(body.refresh_token || '').replace(/^local-/, '');
      const u = await findUserById(id);
      if (!u) return send(res, 400, { error: 'invalid_grant', error_description: 'Bad refresh token' });
      return send(res, 200, sessionFor(u));
    }

    const u = await findUser(body.email || '');
    if (!u || !(await passwordMatches(body.email, body.password || ''))) {
      return send(res, 400, {
        error: 'invalid_grant',
        error_description: 'Invalid login credentials',
        msg: 'Invalid login credentials',
      });
    }
    return send(res, 200, sessionFor(u));
  }

  // Bearer'dan kullanıcıyı çöz
  const auth = req.headers.authorization || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  let claims = null;
  try { claims = JSON.parse(Buffer.from(token.split('.')[1] || '', 'base64url').toString()); } catch { /* yok */ }

  if (p === '/user') {
    if (req.method === 'PUT') {
      const body = await readBody(req);
      if (claims?.sub && body.data) {
        await db.query(
          `update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data,'{}'::jsonb) || $2::jsonb
             where id = $1`, [claims.sub, JSON.stringify(body.data)]);
      }
    }
    const u = claims?.sub ? await findUserById(claims.sub) : null;
    if (!u) return send(res, 401, { message: 'invalid claim: missing sub claim' });
    return send(res, 200, userPayload(u));
  }

  if (p === '/logout') { res.writeHead(204, CORS); return res.end(); }

  // MFA — yerel yığında kapalı: hiç faktör yok
  if (p === '/factors' && req.method === 'GET') return send(res, 200, []);
  if (p.startsWith('/factors')) return send(res, 200, { id: null, factors: [] });

  if (p === '/signup') {
    const body = await readBody(req);
    const u = await findUser(body.email || '');
    if (u) return send(res, 200, sessionFor(u));
    return send(res, 400, { error: 'signup_disabled', msg: 'Yerel yığında kayıt kapalı' });
  }

  if (p === '/recover' || p === '/otp' || p === '/resend') return send(res, 200, {});

  return send(res, 404, { message: `auth stub: ${p} desteklenmiyor` });
}

// ─────────────────────────────────────────────────────── PostgREST vekili ───
function proxyToPostgrest(req, res, url) {
  const target = new URL(PGRST);
  const headers = { ...req.headers, host: target.host };
  delete headers['accept-encoding'];

  // anon istekleri: Authorization yoksa anon JWT ekle
  if (!headers.authorization && !headers.Authorization) headers.authorization = `Bearer ${ANON_KEY}`;

  const upstream = http.request({
    host: target.hostname,
    port: target.port,
    method: req.method,
    path: url.pathname.replace(/^\/rest\/v1/, '') + url.search,
    headers,
  }, (ur) => {
    // PostgREST kendi CORS başlıklarını üretiyor; üstüne bizimkini eklersek
    // tarayıcı "Access-Control-Allow-Origin contains multiple values" diyor.
    const clean = { ...ur.headers };
    for (const k of Object.keys(clean)) {
      if (k.toLowerCase().startsWith('access-control-')) delete clean[k];
    }
    res.writeHead(ur.statusCode || 500, { ...clean, ...CORS });
    ur.pipe(res);
  });
  upstream.on('error', (e) => send(res, 502, { message: 'postgrest erişilemedi: ' + e.message }));
  req.pipe(upstream);
}

// ────────────────────────────────────────────────────────────────── sunucu ──
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }

  try {
    if (url.pathname.startsWith('/auth/v1')) return await handleAuth(req, res, url);
    if (url.pathname.startsWith('/rest/v1')) return proxyToPostgrest(req, res, url);

    if (url.pathname.startsWith('/storage/v1')) {
      const seed = url.pathname.split('/').pop() || 'oyna';
      res.writeHead(200, { 'content-type': 'image/svg+xml', ...CORS });
      return res.end(placeholderSvg(seed));
    }

    if (url.pathname.startsWith('/functions/v1')) return send(res, 200, { ok: true, local: true });
    if (url.pathname.startsWith('/realtime/v1')) { res.writeHead(501, CORS); return res.end(); }

    return send(res, 404, { message: 'bilinmeyen yol' });
  } catch (e) {
    return send(res, 500, { message: String(e?.message || e) });
  }
});

server.on('upgrade', (_req, socket) => socket.destroy()); // realtime WS kapalı

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[gateway] http://127.0.0.1:${PORT}  → PostgREST ${PGRST}, DB ${DB_URL}`);
  console.log(`[gateway] ANON_KEY=${ANON_KEY}`);
});
