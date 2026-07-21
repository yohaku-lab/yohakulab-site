// Google AdSense のパブリッシャー ID（例: "ca-pub-1234567890123456"）。
//
// 空文字の間は AdSense を一切出力しない（<head> のスクリプトも ads.txt も無効）。
// AdSense でサイトが承認され、確認コードの client 値（ca-pub-XXXXXXXXXXXXXXXX）が
// 分かったら、ここに入れて push するだけで全ページ + ads.txt が同時に有効化される。
export const ADSENSE_CLIENT = 'ca-pub-8394919705602254';

// Cloudflare Web Analytics のサイトトークン（32桁の16進文字列）。
//
// 空文字の間はビーコンを一切出力しない（＝本番に無害）。
// Cloudflare ダッシュボード → Analytics & Logs → Web Analytics で
// yohakulab.app を追加すると発行される data-cf-beacon の token を入れて push すれば有効化される。
// Cookie を使わない計測なので、同意バナーは不要（プライバシーポリシーに明記済み）。
export const CF_ANALYTICS_TOKEN = '716155075ce245beb2f4a4e8b770bfca';
