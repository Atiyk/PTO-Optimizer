import { describe, expect, it } from 'vitest';
import { PRODUCT_NAME } from '../brand';

const manifestText = Object.values(import.meta.glob('../../public/manifest.webmanifest', { query: '?raw', import: 'default', eager: true }))[0] as string;
const PUBLIC_FILES = Object.keys(import.meta.glob('../../public/{icons/*.png,apple-touch-icon.png}', { query: '?url', import: 'default', eager: true }))
  .map((path) => path.replace('../../public', ''));
const PAGES: Record<string, string> = import.meta.glob(
  ['../../index.html', '../../*/index.html', '../../glossary/*/index.html', '!../../_dev/**', '!../../dist/**', '!../../node_modules/**', '!../../public/**'],
  { query: '?raw', import: 'default', eager: true },
);
const GLOSSARY_GENERATOR = Object.values(import.meta.glob('../../scripts/generate-glossary-html.ts', { query: '?raw', import: 'default', eager: true }))[0] as string;
const DESIGN = Object.values(import.meta.glob('../../DESIGN.md', { query: '?raw', import: 'default', eager: true }))[0] as string;

interface ManifestIcon { src: string; sizes: string; type: string; purpose?: string }

describe('web app manifest (P3 PWA)', () => {
  const manifest = JSON.parse(manifestText) as Record<string, unknown> & { icons: ManifestIcon[] };

  it('is valid JSON with the installability fields', () => {
    expect(manifest.name).toBe(PRODUCT_NAME);
    expect(manifest.short_name).toBe('Timebower');
    expect((manifest.short_name as string).length).toBeLessThanOrEqual(12);
    expect(manifest.start_url).toBe('/?source=pwa');
    expect(manifest.scope).toBe('/');
    expect(manifest.id).toBe('/');
    expect(manifest.display).toBe('standalone');
  });

  it('takes its colours from the design tokens (bg-page)', () => {
    const page = /bg-page: "(#[0-9a-f]{6})"/.exec(DESIGN)?.[1];
    expect(page).toBe('#f8fafc');
    expect(manifest.theme_color).toBe(page);
    expect(manifest.background_color).toBe(page);
  });

  it('lists 192 and 512 icons for "any" and "maskable", and every icon file exists', () => {
    const has = (size: string, purpose: string) => manifest.icons.some((icon) => icon.sizes === size && (icon.purpose ?? 'any').split(' ').includes(purpose));
    expect(has('192x192', 'any')).toBe(true);
    expect(has('512x512', 'any')).toBe(true);
    expect(has('192x192', 'maskable')).toBe(true);
    expect(has('512x512', 'maskable')).toBe(true);
    for (const icon of manifest.icons) {
      expect(icon.type).toBe('image/png');
      expect(PUBLIC_FILES).toContain(icon.src);
    }
    expect(PUBLIC_FILES).toContain('/apple-touch-icon.png');
  });

  it('makes no promise of sync or permanence', () => {
    expect(manifestText).not.toMatch(/sync|forever|never lose|backed up|permanent/i);
  });
});

describe('every page head links the manifest (P3 PWA)', () => {
  it('scans the app pages', () => {
    expect(Object.keys(PAGES)).toContain('../../index.html');
    expect(Object.keys(PAGES)).toContain('../../pto/index.html');
    expect(Object.keys(PAGES).length).toBeGreaterThan(40);
  });

  it('has the manifest, theme colour and Apple icon and title in each head', () => {
    for (const [file, html] of Object.entries(PAGES)) {
      const head = html.slice(0, html.indexOf('</head>'));
      expect(head, file).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
      expect(head, file).toContain('<meta name="theme-color" content="#f8fafc" />');
      expect(head, file).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />');
      expect(head, file).toContain('<meta name="apple-mobile-web-app-title" content="%PRODUCT_NAME%" />');
    }
    // Generated glossary pages keep it when regenerated.
    expect(GLOSSARY_GENERATOR).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
  });
});

describe('the start URL opens the homepage (P3 PWA)', () => {
  // index.html's inline script sends historic optimizer links at "/" on to /pto.
  const html = PAGES['../../index.html'];
  const script = /<script>\s*(if \(window\.location\.pathname === '\/'[\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';
  const run = (search: string) => {
    const location = { pathname: '/', search, hash: '', replaced: '' as string, replace(to: string) { this.replaced = to; } };
    new Function('window', 'URLSearchParams', script)({ location }, URLSearchParams);
    return location.replaced;
  };

  it('does not redirect the installed app start URL', () => {
    expect(script).not.toBe('');
    expect(run('?source=pwa')).toBe('');
  });

  it('still redirects historic optimizer links, unchanged', () => {
    expect(run('?c=US&b=15')).toBe('/pto?c=US&b=15');
    expect(run('?source=pwa&c=US')).toBe('/pto?source=pwa&c=US');
    expect(run('?home=1&c=US')).toBe('');
    expect(run('')).toBe('');
  });
});
