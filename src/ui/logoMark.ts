import { PRODUCT_NAME } from '../brand';

/** Open Day uses a single color and preserves the gap around the lifted day tile. */
export const LOGO_COLORS = { ink: '#000000', paper: '#ffffff', page: '#f8fafc' } as const;

export const OPEN_DAY_BODY = 'M8 2H18V16H31V24A6 6 0 0 1 25 30H7A6 6 0 0 1 1 24V9A7 7 0 0 1 8 2Z';
export const OPEN_DAY_TILE = { x: 20, y: 2, size: 11, radius: 2.5 } as const;

export function logoMarkInner(color: string = LOGO_COLORS.ink): string {
  const { x, y, size, radius } = OPEN_DAY_TILE;
  return `<path d="${OPEN_DAY_BODY}" fill="${color}"/><rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${radius}" fill="${color}"/>`;
}

export function logoSvgDocument(size = 32): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">${logoMarkInner()}</svg>`;
}

export function logoLockupSvg(tone: 'light' | 'dark' = 'light'): string {
  const color = tone === 'dark' ? LOGO_COLORS.paper : LOGO_COLORS.ink;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="196" height="40" viewBox="0 0 196 40"><g transform="translate(0 4)">${logoMarkInner(color)}</g><text x="42" y="29" font-family="Archivo, Arial, sans-serif" font-weight="760" font-stretch="88%" font-size="28" letter-spacing="-0.7" fill="${color}">${PRODUCT_NAME}</text></svg>`;
}
