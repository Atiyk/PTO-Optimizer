import { Source_Serif_4 } from 'next/font/google';

/** Serif for marketing headings (h1/h2) only; loaded by the public marketing pages alone. */
export const serif = Source_Serif_4({ subsets: ['latin'], weight: ['600'], display: 'swap', variable: '--font-display' });
