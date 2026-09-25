/**
 * 意味の検証（仕様書 4.5 の層 2）
 *
 * 形（zod）では表現できない制約をここで見る。
 * hard error は修復リトライの材料にし、soft flag はアプリ側の要確認（4.6）に任せる。
 */
import { isValidDate, type Extraction } from "@syllabus/shared";

/** 再試行が必要な誤り。メッセージはそのまま LLM に返す */
export function hardErrors(x: Extraction): string[] {
  const errors: string[] = [];

  x.events.forEach((e, i) => {
    // date と session_number が両方 null なのは誤りにしない。「最終回」のように決められない
    // 表現で両方を埋めさせると、書類に無い日付を創作させることになる（9/24 のケース 002）。
    // アプリ側で「日付を入力してください」と要確認に出す。
    // ただし書類に日付の表記（date_raw）があるのに date が空なのは、読み取りの失敗なのでやり直させる
    // （9/25：「9／25（金）」の「金」を「登」と読み、date を null にして返した。ケース 002）
    // 数字を含むときだけにする。「後学期の授業時」のような言葉を date_raw に書くこともあり、
    // それでやり直させると、LLM が予定ごと消して辻褄を合わせてしまう（ケース 003 の小テスト）
    if (e.date_raw != null && /[0-9０-９]/.test(e.date_raw) && e.date == null && e.session_number == null) {
      errors.push(
        `events[${i}]: date_raw が "${e.date_raw}" なのに date が null です。date_raw の日付を YYYY-MM-DD にしてください。`,
      );
    }
    if (e.course_index >= x.courses.length) {
      errors.push(
        `events[${i}]: course_index が ${e.course_index} ですが、courses は ${x.courses.length} 件（0〜${x.courses.length - 1}）です。`,
      );
    }
    if (e.date != null && !isValidDate(e.date)) {
      errors.push(`events[${i}]: date "${e.date}" は存在しない日付です。`);
    }
  });

  return errors;
}
