import { resolveAffiliateLink } from '../src/affiliate';

interface Env {
  ASSETS: Fetcher;
}

// `/go/<slug>` だけをこの Worker が処理する（wrangler.jsonc の run_worker_first）。
// それ以外のパスは静的アセットにそのまま委譲するので、サイトの挙動は変わらない。
const GO_PATH = /^\/go\/([a-z0-9-]+)\/?$/;

// リファラは「どの記事が送客したか」だけを知りたい。同一オリジンならパスのみを
// 記録し、外部からの流入は 'external' に丸める（訪問者を追跡しないため）。
function sourcePath(request: Request): string {
  const referer = request.headers.get('referer');
  if (!referer) return 'direct';
  try {
    const url = new URL(referer);
    return url.hostname === 'yohakulab.app' ? url.pathname : 'external';
  } catch {
    return 'unknown';
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const match = url.pathname.match(GO_PATH);

    if (match) {
      const slug = match[1];
      const link = resolveAffiliateLink(slug);

      // 未提携・提携終了・タイポの slug は 404 にする（誤ったリンク先へ飛ばさない）
      if (!link) {
        console.log(
          JSON.stringify({ event: 'affiliate_miss', slug, from: sourcePath(request) })
        );
        return new Response('Not Found', { status: 404 });
      }

      console.log(
        JSON.stringify({
          event: 'affiliate_click',
          slug,
          program: link.program,
          from: sourcePath(request),
          country: (request as { cf?: { country?: string } }).cf?.country ?? 'unknown',
        })
      );

      return new Response(null, {
        status: 302, // 提携先が変わりうるので恒久リダイレクトにはしない
        headers: {
          Location: link.url,
          'Cache-Control': 'no-store',
          // 中間URLを検索結果に載せない・リンクジュースを渡さない
          'X-Robots-Tag': 'noindex, nofollow',
        },
      });
    }

    return env.ASSETS.fetch(request);
  },
};
