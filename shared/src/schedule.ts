/**
 * 回数 → 日付変換（仕様書 4.3）
 *
 * 画面から切り離した純粋関数として書き、単体テストを付ける。
 * 日付は "YYYY-MM-DD" の文字列のまま扱い、Date / toISOString は使わない。
 */
import { eachDate, weekdayOf, type Weekday } from "./dates";
import { isHoliday as defaultIsHoliday, type IsHolidayFn } from "./holidays";
import type { Course, Semester } from "./types";

/**
 * その日に授業があるか、あるとすれば何曜日の授業か（＝授業曜日）。
 *
 * 判定の優先順位（上が優先。明示的な指定が自動判定を上書きする）：
 *   1. 振替授業日      → 授業あり・振替先の曜日
 *   2. 休講日          → 授業なし
 *   3. 祝日            → 授業なし
 *   4. 祝日だが授業日  → 授業あり・実際の曜日
 *   5. それ以外        → 授業あり・実際の曜日
 *
 * 同じ日が振替授業日と休講日の両方に入っていた場合は振替授業日が勝つ。
 */
export function effectiveWeekday(
  sem: Semester,
  date: string,
  isHoliday: IsHolidayFn = defaultIsHoliday,
): Weekday | null {
  const makeup = sem.makeupDays.find((x) => x.date === date);
  if (makeup) return makeup.asWeekday;                                  // 1
  if (sem.noClassDates.includes(date)) return null;                     // 2
  if (isHoliday(date) && !sem.classHolidays.includes(date)) return null; // 3 / 4
  return weekdayOf(date);                                               // 5
}

/** 学期中の「その曜日の授業日リスト」を先頭から順に並べる */
export function classDates(
  sem: Semester,
  weekday: Weekday,
  isHoliday: IsHolidayFn = defaultIsHoliday,
): string[] {
  const out: string[] = [];
  for (const d of eachDate(sem.start, sem.end)) {
    if (effectiveWeekday(sem, d, isHoliday) === weekday) out.push(d);
  }
  return out;
}

export type SessionResolution =
  | { date: string; index: number }
  | { date: null; reason: "weekday_unknown" | "session_unresolved" | "first_session_not_found" };

/**
 * 第 n 回 → 日付。
 *
 * firstSessionDate が設定されていれば、その日を授業日リストの中で探し、そこを第 1 回として数える
 * （ガイダンス回や履修登録期間で初回がずれる大学・科目に対応）。
 */
export function resolveSession(
  sem: Semester,
  course: Pick<Course, "weekday" | "firstSessionDate">,
  n: number,
  isHoliday: IsHolidayFn = defaultIsHoliday,
): SessionResolution {
  if (!course.weekday) return { date: null, reason: "weekday_unknown" };

  const list = classDates(sem, course.weekday, isHoliday);
  const base = course.firstSessionDate ? list.indexOf(course.firstSessionDate) : 0;
  if (base < 0) return { date: null, reason: "first_session_not_found" };

  const i = base + (n - 1);
  const date = list[i];
  if (!date) return { date: null, reason: "session_unresolved" };
  return { date, index: i };
}

/** 学期中にその曜日の授業が何回あるか（確認画面の「全 15 回」表示用） */
export function sessionCount(
  sem: Semester,
  course: Pick<Course, "weekday" | "firstSessionDate">,
  isHoliday: IsHolidayFn = defaultIsHoliday,
): number | null {
  if (!course.weekday) return null;
  const list = classDates(sem, course.weekday, isHoliday);
  const base = course.firstSessionDate ? list.indexOf(course.firstSessionDate) : 0;
  return base < 0 ? null : list.length - base;
}
