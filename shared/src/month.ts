/**
 * 月のカレンダー（S8）のマス目
 *
 * 画面（app/app/month.tsx）から計算を切り離してここに置く。React Native を起動しなくても
 * vitest で確かめられ、dates.ts と同じく Date を使わない（4.3）。
 */
import { WEEKDAYS, daysInMonth, formatDate, nextDate, weekdayOf } from "./dates";

export type YearMonth = { y: number; m: number };

/** 月を n か月ずらす（負なら前へ）。年またぎを跨ぐ */
export function addMonths({ y, m }: YearMonth, n: number): YearMonth {
  const i = y * 12 + (m - 1) + n;
  return { y: Math.floor(i / 12), m: (i % 12) + 1 };
}

/**
 * その月を含む 6 週 × 7 日のマス目（日曜始まり）。前後の月の日も埋める。
 *
 * 常に 6 週にするのは、月によって 4〜6 週と行数が変わると、月を切り替えるたびに
 * 画面の高さが変わって下の一覧が上下に跳ねるため（Google カレンダーも 6 週で固定）。
 */
export function monthGrid({ y, m }: YearMonth): string[][] {
  const first = formatDate({ y, m, d: 1 });
  // 1 日の曜日のぶんだけ前の月に戻る（日曜なら 0 日）
  const lead = WEEKDAYS.indexOf(weekdayOf(first));
  const prev = addMonths({ y, m }, -1);
  const prevDays = daysInMonth(prev.y, prev.m);

  let cur = lead === 0 ? first : formatDate({ ...prev, d: prevDays - lead + 1 });
  const weeks: string[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(cur);
      cur = nextDate(cur);
    }
    weeks.push(week);
  }
  return weeks;
}

/** "YYYY-MM-DD" がその月に入るか。マス目の前後の月の日を薄く出すのに使う */
export function inMonth(date: string, { y, m }: YearMonth): boolean {
  return date.startsWith(`${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-`);
}
