## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)

## アフィリエイト導線（`/go/*`）

記事に生のアフィリエイトURLを書かない。必ず `/go/<slug>` を経由させる。

- **リンクの登録**: `src/affiliate.ts` の `AFFILIATE_LINKS` に slug を追加する。提携が
  下りるまでは `url: ''` / `active: false` のままでよい（リンクも広告表記も描画されない）。
  ASPの提携が承認されたら `url` を入れて `active: true` にするだけで全記事に反映される。
- **記事での使い方**: 冒頭に `<AffiliateDisclosure slugs={[...]} />`、本文中に
  `<AffiliateLink slug="..." text="..." note="..." />`。
- **リダイレクト**: `worker/index.ts` が `/go/*` だけを処理し、302 で提携先へ飛ばす。
  同時に `affiliate_click` を構造化ログで出力する（Workers Logs に残る）。
  それ以外のパスは従来どおり静的アセットが先に返る（`run_worker_first: ["/go/*"]`）。
- **クリック数の集計**: Cloudflare のダッシュボード → Workers → yohakulab-site →
  Logs で `affiliate_click` を検索する。`from` フィールドにどの記事から飛んだかが入る。
- **公開前チェック**: `npm run check:affiliate`（広告表記・`rel="sponsored"`・生URL混入を検査）。
