/**
 * 科目名の名寄せ（仕様書 6.3 の無料枠カウント用）
 *
 * 「線形代数学Ⅰ」「線形代数学I」「線形代数学 I」を同じ科目として数えないと、
 * 同じ科目を読み直しただけで無料枠が減ってしまう。
 */
const ROMAN: Record<string, string> = {
  "Ⅰ": "I", "Ⅱ": "II", "Ⅲ": "III", "Ⅳ": "IV", "Ⅴ": "V", "Ⅵ": "VI",
  "Ⅶ": "VII", "Ⅷ": "VIII", "Ⅸ": "IX", "Ⅹ": "X", "Ⅺ": "XI", "Ⅻ": "XII",
  "ⅰ": "I", "ⅱ": "II", "ⅲ": "III", "ⅳ": "IV", "ⅴ": "V", "ⅵ": "VI",
};

/** 比較用のキー。表示には使わない（表示は元の名前のまま） */
export function normalizeCourseName(name: string): string {
  let s = name.normalize("NFKC");
  s = s.replace(/[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅪⅫⅰⅱⅲⅳⅴⅵ]/g, (c) => ROMAN[c] ?? c);
  s = s.replace(/[\s　]/g, "");        // 空白（全角含む）を除去
  s = s.replace(/[（）()「」【】\[\]]/g, ""); // 括弧を除去
  s = s.replace(/[・･\-‐－ー_]/g, "");       // 中黒・ハイフン類を除去
  return s.toUpperCase();
}

export function sameCourse(a: string, b: string): boolean {
  return normalizeCourseName(a) === normalizeCourseName(b);
}
