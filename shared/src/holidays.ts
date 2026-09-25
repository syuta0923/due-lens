/**
 * 日本の祝日（仕様書 4.4）
 *
 * 祝日そのものは保存しない。毎回ライブラリから導出し、保存するのはユーザーの意思決定
 * （classHolidays / noClassDates）だけにする。
 */
import * as holidayJpNs from "@holiday-jp/holiday_jp";

// holiday_jp は CommonJS。読み込む側によって関数が名前空間の直下に来る場合（Metro・vitest）と
// default の下に入る場合（tsx で動かす eval）がある。後者で isHoliday が見つからず eval が落ちた（9/25）
const holidayJp: typeof holidayJpNs =
  typeof holidayJpNs.isHoliday === "function"
    ? holidayJpNs
    : (holidayJpNs as unknown as { default: typeof holidayJpNs }).default;

/** "YYYY-MM-DD" が祝日か。Date を作るのはこの関数の内部だけに閉じ込める */
export function isHoliday(date: string): boolean {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  // holiday_jp は Date 入力。ローカルタイムの 12:00 で作れば UTC 変換でも日付が動かない
  return holidayJp.isHoliday(new Date(y, m - 1, d, 12, 0, 0));
}

export function holidayName(date: string): string | null {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const list = holidayJp.between(new Date(y, m - 1, d, 0, 0, 0), new Date(y, m - 1, d, 23, 59, 59));
  return list[0]?.name ?? null;
}

export type IsHolidayFn = (date: string) => boolean;
