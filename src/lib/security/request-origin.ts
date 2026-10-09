function parseOrigin(value: string): string | null {
  // Origin must contain only an HTTP(S) authority, never a path, credentials or a list.
  if (!/^https?:\/\/[^\s,/@?#\\]+$/i.test(value)) return null;
  try {
    const url = new URL(value);
    return url.username || url.password ? null : url.origin;
  } catch { return null; }
}

/** Shared CSRF check for requests handled directly by Next.js or its trusted proxy. */
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin || request.headers.get('sec-fetch-site') === 'cross-site') return false;
  const source = parseOrigin(origin);
  if (!source) return false;

  const nextUrl = (request as Request & { nextUrl?: Pick<URL, 'host' | 'protocol'> }).nextUrl;
  const url = nextUrl ?? new URL(request.url);
  // Next dev supplies these headers; Vercel supplies the public host/protocol.
  // Any additional reverse proxy must overwrite forwarded headers at its trust boundary.
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? url.host;
  const protocol = request.headers.get('x-forwarded-proto') ?? url.protocol.replace(/:$/, '');
  if (!/^https?$/i.test(protocol) || !host || /[\s,/@?#\\]/.test(host)) return false;
  const target = parseOrigin(`${protocol}://${host}`);
  return target !== null && source === target;
}
