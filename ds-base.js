// templates/landing/ds-base.js
(() => {
  const base = '_ds/classical-8f6f9324-18f5-4c72-8750-50f577e7d92e';
  // styles.css is loaded via a static <link> in each page's <head> (avoids FOUC) — only the bundle script loads dynamically here.
  const s = document.createElement('script');
  s.src = base + '/_ds_bundle.js';
  s.onerror = () => console.error('ds-base.js: failed to load ' + s.src + ' — if this is a consuming project, point the base line in ds-base.js at the bound _ds/<folder> tree relative to this page (e.g. _ds/<folder> at the project root, ../_ds/<folder> one level down); in a fresh design system this can just mean the bundle is not compiled yet');
  document.head.appendChild(s);
})();
