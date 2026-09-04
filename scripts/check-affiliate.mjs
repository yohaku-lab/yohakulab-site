// ビルド後のアフィリ導線チェック。`npm run check:affiliate` で実行。
//
//  1. /go/ リンクを含むページに広告表記（AffiliateDisclosure）があるか  … ステマ規制
//  2. /go/ リンクに rel="sponsored" が付いているか                      … Google のガイドライン
//  3. 生のアフィリURLが本文に直接書かれていないか                        … 導線の一元管理
//
// 1つでも違反があれば exit 1。

import { readFileSync, globSync } from 'node:fs';

const DISCLOSURE = 'アフィリエイト広告';
const RAW_ASP_HOSTS = [
  'px.a8.net',
  'a8.net/',
  'af.moshimo.com',
  'ck.jp.ap.valuecommerce.com',
  'accesstrade.net',
];

const files = globSync('dist/**/*.html');
const problems = [];

for (const file of files) {
  const html = readFileSync(file, 'utf8');

  const goLinks = [...html.matchAll(/<a\b[^>]*href="\/go\/[^"]*"[^>]*>/g)].map((m) => m[0]);

  if (goLinks.length > 0 && !html.includes(DISCLOSURE)) {
    problems.push(`${file}: /go/ リンクがあるのに広告表記がない（AffiliateDisclosure を冒頭に置く）`);
  }

  for (const tag of goLinks) {
    if (!/rel="[^"]*sponsored/.test(tag)) {
      problems.push(`${file}: rel="sponsored" がない → ${tag}`);
    }
  }

  for (const host of RAW_ASP_HOSTS) {
    if (html.includes(host)) {
      problems.push(`${file}: 生のアフィリURL(${host})が直接書かれている → src/affiliate.ts 経由にする`);
    }
  }
}

const linked = files.filter((f) => readFileSync(f, 'utf8').includes('href="/go/')).length;

if (problems.length > 0) {
  console.error('アフィリ導線チェック: NG');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(`アフィリ導線チェック: OK（${files.length}ページ検査 / 導線あり ${linked}ページ）`);
