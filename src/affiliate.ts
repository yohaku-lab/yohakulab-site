// アフィリエイト導線の一元管理。
//
// 記事には生のアフィリURLを書かず、必ず `/go/<slug>` を経由させる。こうすると
//   1. クリック数が Workers Logs に残る（＝効果測定できる）
//   2. 提携先の変更・終了時に、このファイル 1 箇所を直すだけで全記事に反映される
//   3. HTML にアフィリURLが直接出ないので、提携終了リンクが本文に残り続けない
//
// active: false の間はリンク自体が一切描画されない（＝提携承認前に記事へ
// 置いておける。承認が下りたら url を入れて active: true にするだけ）。

export type AffiliateLink = {
  /** 提携先の表示名（PR表記の隣に出る） */
  label: string;
  /** ASP名と案件名。管理用のメモで、ページには出ない */
  program: string;
  /** ASPが発行したアフィリエイトURL。未提携の間は空文字 */
  url: string;
  /** false の間は描画しない */
  active: boolean;
};

export const AFFILIATE_LINKS: Record<string, AffiliateLink> = {
  // --- ふるさと納税（限度額の記事から送客）。2026-09-04 にA8.netで提携申請、審査中 ---
  'furusato-choice': {
    label: 'ふるさとチョイス',
    program: 'A8.net / 株式会社トラストバンク (20-1215)',
    // 成果報酬 寄付金額2.3%（最大手・報酬率が最も高い）／確定率30.2%
    url: '',
    active: false,
  },
  'dshopping-furusato': {
    label: 'dショッピング ふるさと納税',
    program: 'A8.net / ｄショッピング (23-1221)',
    // 成果報酬 新規寄付申込1%／EPC 6.66（検索結果の中で突出して高い）
    url: '',
    active: false,
  },
};

/** 描画・リダイレクトの対象になるリンクだけを返す */
export function resolveAffiliateLink(slug: string): AffiliateLink | null {
  const link = AFFILIATE_LINKS[slug];
  if (!link || !link.active || !link.url) return null;
  return link;
}
