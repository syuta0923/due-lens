/**
 * 日付ユーティリティ（仕様書 4.3「日付の扱い」）
 *
 * カレンダー上の日付は "YYYY-MM-DD" の文字列として扱い、JavaScript の Date を経由させない。
 * JST では `new Date(2026, 9, 20).toISOString()` が前日に飛ぶため。
 * このファイルでは Date / toISOString を一切使わない。
 */

export type Weekday = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";

export const WEEKDAYS: readonly Weekday[] = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/** 漢字の曜日 → Weekday。date_raw の曜日クロスチェック（4.2）で使う */
export const KANJI_TO_WEEKDAY: Record<string, Weekday> = {
  日: "SUN", 月: "MON", 火: "TUE", 水: "WED", 木: "THU", 金: "FRI", 土: "SAT",
};

export const WEEKDAY_TO_KANJI: Record<Weekday, string> = {
  SUN: "日", MON: "月", TUE: "火", WED: "水", THU: "木", FRI: "金", SAT: "土",
};

export type YMD = { y: number; m: number; d: number };

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y: number, m: number): number {
  switch (m) {
    case 1: case 3: case 5: case 7: case 8: case 10: case 12: return 31;
    case 4: case 6: case 9: case 11: return 30;
    case 2: return isLeapYear(y) ? 29 : 28;
    default: return 0;
  }
}

/** "YYYY-MM-DD" として妥当か（2026-02-30 のような存在しない日は false） */
export function isValidDate(s: string): boolean {
  const m = ISO_RE.exec(s);
  if (!m) return false;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12) return false;
  return d >= 1 && d <= daysInMonth(y, mo);
}

export function parseDate(s: string): YMD {
  const m = ISO_RE.exec(s);
  if (!m || !isValidDate(s)) throw new Error(`invalid date: ${s}`);
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

export function formatDate({ y, m, d }: YMD): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** 翌日。月末・年またぎを跨ぐ */
export function nextDate(s: string): string {
  const { y, m, d } = parseDate(s);
  if (d < daysInMonth(y, m)) return formatDate({ y, m, d: d + 1 });
  if (m < 12) return formatDate({ y, m: m + 1, d: 1 });
  return formatDate({ y: y + 1, m: 1, d: 1 });
}

/** Sakamoto のアルゴリズム。Date を使わずに曜日を求める */
export function weekdayOf(s: string): Weekday {
  const { y, m, d } = parseDate(s);
  const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  const yy = m < 3 ? y - 1 : y;
  const idx = (yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) + t[m - 1]! + d) % 7;
  return WEEKDAYS[idx]!;
}

/** ISO 文字列は辞書順＝時系列順 */
export function compareDate(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isBetween(d: string, start: string, end: string): boolean {
  return d >= start && d <= end;
}

/** start から end まで（両端含む）を 1 日ずつ返す */
export function* eachDate(start: string, end: string): Generator<string> {
  if (!isValidDate(start) || !isValidDate(end)) throw new Error("invalid range");
  let cur = start;
  // 無限ループ避け：10 年分を上限とする
  for (let i = 0; cur <= end && i < 3700; i++) {
    yield cur;
    cur = nextDate(cur);
  }
}

/** 表示用："2026-11-17" → "11/17（月）" */
export function formatJa(s: string): string {
  const { m, d } = parseDate(s);
  return `${m}/${d}（${WEEKDAY_TO_KANJI[weekdayOf(s)]}）`;
}
