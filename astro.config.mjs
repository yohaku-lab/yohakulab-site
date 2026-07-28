// @ts-check
import fs from 'node:fs';
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';

// Cloudflare Pages normalizes /about -> /about/ with a 307 (temporary), which Google
// treats as a weak signal when picking the canonical URL. Emit explicit 301s instead.
// Rules are generated from the actual page list, so new posts are covered automatically.
function trailingSlashRedirects() {
  return {
    name: 'trailing-slash-redirects',
    hooks: {
      /** @type {(opts: { dir: URL, pages: { pathname: string }[] }) => void} */
      'astro:build:done': ({ dir, pages }) => {
        const rules = [
          ...new Set(
            pages
              .map((page) => `/${page.pathname.replace(/\/$/, '')}`)
              .filter((route) => route !== '/' && route !== '/404')
          ),
        ]
          .sort()
          .map((route) => `${route} ${route}/ 301`);

        const file = new URL('_redirects', dir);
        const existing = fs.existsSync(file)
          ? `${fs.readFileSync(file, 'utf8').trimEnd()}\n`
          : '';
        fs.writeFileSync(file, `${existing}${rules.join('\n')}\n`);
      },
    },
  };
}

// https://astro.build/config
export default defineConfig({
  site: 'https://yohakulab.app',
  integrations: [mdx(), sitemap(), trailingSlashRedirects()],
  server: { port: 4321 },
});
