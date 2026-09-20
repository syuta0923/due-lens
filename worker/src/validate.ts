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
    if (e.date == null && e.session_number == null) {
      errors.push(`events[${i}]: date と session_number が両方 null です。必ずどちらかを埋めてください。`);
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
