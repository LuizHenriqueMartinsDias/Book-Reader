/** Hosts the proxy may fetch from: the Internet Archive and its file servers. */
const ALLOWED_HOSTS = ['archive.org'];

const ALLOWED_ORIGINS = ['https://luizhenriquemartinsdias.github.io', 'http://localhost:5173', 'http://localhost:4173'];
/** The dev server on the local network, to test on the tablet. */
const LAN_ORIGIN = /^http:\/\/(192\.168|10)\.\d{1,3}\.\d{1,3}(\.\d{1,3})?:5173$/;

export function isAllowedTarget(raw: string | null): URL | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  return ALLOWED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`)) ? url : null;
}

export function allowedOrigin(origin: string | null): string | null {
  if (!origin) return null;
  return ALLOWED_ORIGINS.includes(origin) || LAN_ORIGIN.test(origin) ? origin : null;
}

/** Only PDFs go through, so the proxy can't be used to fetch arbitrary pages. */
export function isPdfResponse(contentType: string | null, url: URL) {
  const type = (contentType ?? '').split(';')[0].trim().toLowerCase();
  return type === 'application/pdf' || (type === 'application/octet-stream' && url.pathname.toLowerCase().endsWith('.pdf'));
}
