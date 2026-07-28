const TEST_SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://lucajournal.com/sitemap-function-routing-test</loc>
  </url>
</urlset>
`;

export function onRequestGet() {
  return new Response(TEST_SITEMAP, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "X-Sitemap-Source": "cloudflare-function-test",
    },
  });
}
