/**
 * 仮の学期（第5版で学期設定の比重を下げた）
 *
 * 主目的が「課題の締切」になり、学期は「第n回」を日付に変えるときにしか使わない。
 * 使う前に学期を設定させると入口が 1 つ増えるので、今日の日付から多くの大学に合う
 * 仮の学期を作って、設定しなくても読み込めるようにする。違っていれば設定から直す。
 *
 * id は年と前期・後期から決まる値にする。無料枠（6.3）のキーに学期 ID を使うため、
 * 起動のたびに変わると枠がリセットされてしまう。
 */
import { parseDate } from "./dates";
import type { Semester } from "./types";

/** 4〜8 月は前期、9〜3 月は後期とみなす */
export function defaultSemester(today: string): Semester {
  const { y, m } = parseDate(today);
  const base = { noClassDates: [], classHolidays: [], makeupDays: [] };

  if (m >= 4 && m <= 8) {
    return { id: `auto-${y}-1`, name: `${y}年度 前期`, start: `${y}-04-08`, end: `${y}-08-05`, ...base };
  }
  const fy = m >= 9 ? y : y - 1; // 1〜3 月は前の年度の後期
  return {
    id: `auto-${fy}-2`,
    name: `${fy}年度 後期`,
    start: `${fy}-10-01`,
    end: `${fy + 1}-02-10`,
    ...base,
  };
}
