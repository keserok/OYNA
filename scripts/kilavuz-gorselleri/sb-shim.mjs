// Supabase yerel şimi: localhost:54321 → (ajan proxy CONNECT tüneli) → supabase.co
// Chromium'un ajan proxy MITM TLS'ine takılmaması için tarayıcı Supabase'e düz HTTP
// ile localhost üzerinden çıkar; TLS'i Node kurar (CA: /root/.ccr/ca-bundle.crt).
// WS upgrade (realtime) dahil.
import http from 'node:http';
import tls from 'node:tls';
import fs from 'node:fs';
import { URL } from 'node:url';

const TARGET_HOST = 'iikvzgyccvgcybzdfwlv.supabase.co';
const TARGET_PORT = 443;
const LISTEN_PORT = 54321;
const CA = fs.readFileSync('/root/.ccr/ca-bundle.crt');
const PROXY = new URL(process.env.HTTPS_PROXY || process.env.https_proxy);

function openTunnel() {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: PROXY.hostname,
      port: PROXY.port || 80,
      method: 'CONNECT',
      path: `${TARGET_HOST}:${TARGET_PORT}`,
      headers: { Host: `${TARGET_HOST}:${TARGET_PORT}` },
    });
    req.on('connect', (res, socket) => {
      if (res.statusCode !== 200) { reject(new Error(`CONNECT ${res.statusCode}`)); socket.destroy(); return; }
      const tlsSocket = tls.connect({ socket, servername: TARGET_HOST, ca: CA }, () => resolve(tlsSocket));
      tlsSocket.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

const server = http.createServer(async (creq, cres) => {
  try {
    const tlsSocket = await openTunnel();
    const headers = { ...creq.headers, host: TARGET_HOST };
    delete headers.connection;
    let head = `${creq.method} ${creq.url} HTTP/1.1\r\n`;
    for (const [k, v] of Object.entries(headers)) head += `${k}: ${v}\r\n`;
    head += 'connection: close\r\n\r\n';
    tlsSocket.write(head);
    creq.pipe(tlsSocket);
    // Yanıtı ham olarak geri akıt (status satırı + başlıklar + gövde)
    let buffered = Buffer.alloc(0), headerDone = false;
    tlsSocket.on('data', (chunk) => {
      if (headerDone) { cres.socket && cres.socket.write(chunk); return; }
      buffered = Buffer.concat([buffered, chunk]);
      const idx = buffered.indexOf('\r\n\r\n');
      if (idx !== -1) {
        headerDone = true;
        creq.socket.write(buffered); // status+headers+ilk gövde parçası ham geçir
      }
    });
    tlsSocket.on('end', () => { try { creq.socket.end(); } catch {} });
    tlsSocket.on('error', () => { try { creq.socket.destroy(); } catch {} });
    creq.on('close', () => tlsSocket.destroy());
  } catch (e) {
    cres.writeHead(502); cres.end('shim tunnel error: ' + e.message);
  }
});

server.on('upgrade', async (creq, csocket, chead) => {
  try {
    const tlsSocket = await openTunnel();
    const headers = { ...creq.headers, host: TARGET_HOST };
    let head = `${creq.method} ${creq.url} HTTP/1.1\r\n`;
    for (const [k, v] of Object.entries(headers)) head += `${k}: ${v}\r\n`;
    head += '\r\n';
    tlsSocket.write(head);
    if (chead && chead.length) tlsSocket.write(chead);
    tlsSocket.pipe(csocket);
    csocket.pipe(tlsSocket);
    const kill = () => { tlsSocket.destroy(); csocket.destroy(); };
    tlsSocket.on('error', kill); csocket.on('error', kill);
  } catch { csocket.destroy(); }
});

server.listen(LISTEN_PORT, '127.0.0.1', () =>
  console.log(`[sb-shim] http://127.0.0.1:${LISTEN_PORT} → https://${TARGET_HOST} (proxy ${PROXY.host})`));
