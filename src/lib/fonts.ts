import literataItalic from '@fontsource-variable/literata/files/literata-latin-wght-italic.woff2?url';
import literata from '@fontsource-variable/literata/files/literata-latin-wght-normal.woff2?url';
import instrumentSans from '@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2?url';

/**
 * The app's typefaces, bundled so they work offline: Literata (a typeface made for reading
 * books) for titles and reading, Instrument Sans for the interface. Only the Latin subset,
 * which covers Portuguese, Spanish, French and English.
 */
const FACES = [
  { family: 'Literata', url: literata, style: 'normal' },
  { family: 'Literata', url: literataItalic, style: 'italic' },
  { family: 'Instrument Sans', url: instrumentSans, style: 'normal' },
] as const;

const RANGE = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';

/** `@font-face` rules for Literata, with absolute URLs, for documents of their own (EPUB pages). */
export const literataFontFaces = () =>
  FACES.filter((f) => f.family === 'Literata')
    .map(
      (f) =>
        `@font-face{font-family:'Literata';font-style:${f.style};font-weight:200 900;font-display:swap;src:url(${new URL(f.url, location.href).href}) format('woff2');unicode-range:${RANGE}}`,
    )
    .join('');

export function loadFonts() {
  if (typeof FontFace === 'undefined') return;
  for (const f of FACES) {
    const face = new FontFace(f.family, `url(${f.url}) format('woff2')`, { style: f.style, weight: '200 900', display: 'swap', unicodeRange: RANGE });
    // Loaded by the browser the first time text uses it.
    document.fonts.add(face);
  }
}
