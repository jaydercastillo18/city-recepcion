import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSameOriginRequest } from '../src/lib/security/request-origin';

const cases = [
  { name: 'localhost con URL interna 0.0.0.0', headers: { origin: 'http://localhost:3000', host: 'localhost:3000' }, allowed: true },
  { name: 'Vercel con HTTPS público y URL interna HTTP', headers: { origin: 'https://city-recepcion.vercel.app', 'x-forwarded-host': 'city-recepcion.vercel.app', 'x-forwarded-proto': 'https', host: 'internal:3000' }, allowed: true },
  { name: 'IP móvil same-origin sin IP hardcodeada', headers: { origin: 'http://192.168.1.20:3000', host: '192.168.1.20:3000' }, allowed: true },
  { name: 'origen externo evil.example', headers: { origin: 'https://evil.example', host: 'localhost:3000' }, allowed: false },
] as const;

for (const endpoint of ['preview', 'confirm']) {
  for (const scenario of cases) {
    test(`${endpoint}: ${scenario.name}`, () => {
      const request = new Request(`http://0.0.0.0:3000/api/shipments/import/${endpoint}`, { method: 'POST', headers: scenario.headers });
      assert.equal(isSameOriginRequest(request), scenario.allowed);
    });
  }
}

test('dominio del deployment actual e IP local diferente se aceptan por coincidencia exacta', () => {
  for (const host of ['city-recepcion-git-fase-equipo.vercel.app', '10.0.0.48:3000', '[::1]:3000']) {
    const protocol = host.endsWith('.vercel.app') ? 'https' : 'http';
    assert.equal(isSameOriginRequest(new Request('http://internal:3000', { headers: {
      origin: `${protocol}://${host}`, 'x-forwarded-host': host, 'x-forwarded-proto': protocol,
    } })), true);
  }
});

test('no permite otro dominio, subdominio engañoso, protocolo o puerto distinto', () => {
  for (const origin of ['https://sitio-malicioso.com', 'https://otro-dominio.com', 'https://city-recepcion.vercel.app.evil.example', 'http://city-recepcion.vercel.app', 'https://city-recepcion.vercel.app:444']) {
    assert.equal(isSameOriginRequest(new Request('http://internal:3000', { headers: {
      origin, host: 'internal:3000', 'x-forwarded-host': 'city-recepcion.vercel.app', 'x-forwarded-proto': 'https',
    } })), false);
  }
});

test('los forwarded headers prevalecen; la URL interna no añade otro origen permitido', () => {
  assert.equal(isSameOriginRequest(new Request('http://localhost:3000', { headers: {
    origin: 'http://localhost:3000', host: 'localhost:3000', 'x-forwarded-host': 'city-recepcion.vercel.app', 'x-forwarded-proto': 'https',
  } })), false);
});

test('rechaza origen ausente, null, listas, credenciales, rutas y headers ambiguos', () => {
  for (const origin of ['', 'null', 'http://localhost:3000, https://evil.example', 'http://user@localhost:3000', 'http://localhost:3000/ruta', 'http://localhost:3000?x=1', 'http://localhost:3000#x']) {
    assert.equal(isSameOriginRequest(new Request('http://localhost:3000', { headers: { origin, host: 'localhost:3000' } })), false);
  }
  assert.equal(isSameOriginRequest(new Request('http://localhost:3000')), false);
  const invalidHeaders: Record<string, string>[] = [
    { 'x-forwarded-host': 'localhost:3000, evil.example' },
    { 'x-forwarded-host': 'localhost:3000@evil.example' },
    { 'x-forwarded-host': 'localhost:3000/ruta' },
    { 'x-forwarded-proto': 'https,http' },
    { 'x-forwarded-proto': 'ftp' },
    { 'sec-fetch-site': 'cross-site' },
  ];
  for (const headers of invalidHeaders) {
    assert.equal(isSameOriginRequest(new Request('http://localhost:3000', { headers: { origin: 'http://localhost:3000', host: 'localhost:3000', ...headers } })), false);
  }
});

test('fallback a request.url y request.nextUrl y normalización de puertos estándar', () => {
  assert.equal(isSameOriginRequest(new Request('https://city-recepcion.vercel.app/api', { headers: { origin: 'https://city-recepcion.vercel.app:443' } })), true);
  const request = new Request('http://internal:3000', { headers: { origin: 'https://city-recepcion.vercel.app' } });
  Object.defineProperty(request, 'nextUrl', { value: new URL('https://city-recepcion.vercel.app/api') });
  assert.equal(isSameOriginRequest(request), true);
});
