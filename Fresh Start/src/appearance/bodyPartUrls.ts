/**
 * Vite-only asset URL map (A2). Do not import from Node smoke scripts.
 * `import.meta.glob` is compile-time transformed by Vite.
 */
export const BODY_PART_URLS = import.meta.glob('../assets/bodyParts/**/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;
