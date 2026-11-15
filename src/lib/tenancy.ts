/** Resolve only direct children of the configured domain. Never trust tenant headers. */
export const RESERVED_SUBDOMAINS = new Set(['admin', 'api', 'www', 'support', 'app', 'mail', 'test', 'staging', 'dev', 'status', 'static']);
export function resolveTenantHost(host: string, domain: string): { kind: 'admin' | 'shop' | 'root' | 'invalid'; slug?: string } {
  const clean = (value: string) => value.toLowerCase().replace(/:\d+$/, '');
  const hostname = clean(host); const base = clean(domain);
  if (!base || !/^[a-z0-9.-]+$/.test(base) || !/^[a-z0-9.-]+$/.test(hostname)) return { kind: 'invalid' };
  // Pin short-lived public pilots to one explicitly selected tenant.
  const previewHost = process.env.XEROO_PREVIEW_HOST;
  const previewShop = process.env.XEROO_PREVIEW_SHOP;
  if (previewHost && hostname === previewHost && /^[a-z0-9-]+\.trycloudflare\.com$/.test(previewHost)
      && previewShop && /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(previewShop) && !RESERVED_SUBDOMAINS.has(previewShop)) {
    return {kind:'shop', slug:previewShop};
  }
  if (hostname === base) return { kind: 'root' };
  if (!hostname.endsWith('.' + base)) return { kind: 'invalid' };
  const slug = hostname.slice(0, -(base.length + 1));
  if (slug === 'admin') return { kind: 'admin' };
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug) || RESERVED_SUBDOMAINS.has(slug)) return { kind: 'invalid' };
  return { kind: 'shop', slug };
}
