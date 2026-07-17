import type { APIRoute } from 'astro';
import { ADSENSE_CLIENT } from '../consts';

// ADSENSE_CLIENT が設定されているときだけ ads.txt に AdSense の承認レコードを出力する。
// client 値（ca-pub-...）から先頭の "ca-" を除いた pub-... が ads.txt の識別子。
export const GET: APIRoute = () => {
  const pub = ADSENSE_CLIENT.replace(/^ca-/, '').trim();
  const body = pub ? `google.com, ${pub}, DIRECT, f08c47fec0942fa0\n` : '';
  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
