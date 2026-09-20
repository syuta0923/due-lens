import { describe, expect, it } from "vitest";
import { classDates, effectiveWeekday, resolveSession, sessionCount } from "../schedule";
import type { Semester } from "../types";

/** テストでは祝日を注入して決定的にする（本番はライブラリから導出） */
const HOLIDAYS = new Set([
  "2026-10-12", // スポーツの日（月）
  "2026-11-03", // 文化の日（火）
  "2026-11-23", // 勤労感謝の日（月）
  "2027-01-01", // 元日（金）
  "2027-01-11", // 成人の日（月）
]);
const isHoliday = (d: string) => HOLIDAYS.has(d);

const base: Semester = {
  id: "s1",
  name: "2026年度 後期",
  start: "2026-09-28", // 月
  end: "2027-01-29",   // 金
  noClassDates: [],
  classHolidays: [],
  makeupDays: [],
};

describe("effectiveWeekday（判定の優先順位）", () => {
  it("通常の日はその曜日", () => {
    expect(effectiveWeekday(base, "2026-09-28", isHoliday)).toBe("MON");
  });

  it("休講日は授業なし", () => {
    const sem = { ...base, noClassDates: ["2026-10-05"] };
    expect(effectiveWeekday(sem, "2026-10-05", isHoliday)).toBeNull();
  });

  it("祝日は授業なし", () => {
    expect(effectiveWeekday(base, "2026-11-23", isHoliday)).toBeNull();
  });

  it("授業を行う祝日（classHolidays）は実際の曜日", () => {
    const sem = { ...base, classHolidays: ["2026-11-23"] };
    expect(effectiveWeekday(sem, "2026-11-23", isHoliday)).toBe("MON");
  });

  it("振替授業日は振替先の曜日（日曜に月曜の授業）", () => {
    const sem = { ...base, makeupDays: [{ date: "2026-11-15", asWeekday: "MON" as const }] };
    expect(effectiveWeekday(sem, "2026-11-15", isHoliday)).toBe("MON"); // 本来は日曜
  });

  it("振替授業日と休講日が重なったら振替が勝つ", () => {
    const sem = {
      ...base,
      noClassDates: ["2026-11-15"],
      makeupDays: [{ date: "2026-11-15", asWeekday: "MON" as const }],
    };
    expect(effectiveWeekday(sem, "2026-11-15", isHoliday)).toBe("MON");
  });

  it("振替授業日は祝日にも勝つ", () => {
    const sem = { ...base, makeupDays: [{ date: "2026-11-23", asWeekday: "FRI" as const }] };
    expect(effectiveWeekday(sem, "2026-11-23", isHoliday)).toBe("FRI");
  });
});

describe("classDates", () => {
  it("祝日を抜き、振替を足した月曜の授業日リスト", () => {
    const sem: Semester = {
      ...base,
      noClassDates: ["2026-12-28", "2027-01-04"], // 冬休み（抜粋）
      makeupDays: [{ date: "2026-11-15", asWeekday: "MON" }],
    };
    const list = classDates(sem, "MON", isHoliday);
    expect(list[0]).toBe("2026-09-28");
    expect(list).toContain("2026-11-15");     // 振替で増えた日曜
    expect(list).not.toContain("2026-10-12"); // 祝日
    expect(list).not.toContain("2026-11-23"); // 祝日
    expect(list).not.toContain("2027-01-11"); // 祝日
    expect(list).not.toContain("2026-12-28"); // 休講
    expect([...list].sort()).toEqual(list);   // 昇順
  });
});

describe("resolveSession", () => {
  const course = { weekday: "MON" as const, firstSessionDate: null };

  it("第 1 回はリストの先頭", () => {
    expect(resolveSession(base, course, 1, isHoliday)).toMatchObject({ date: "2026-09-28" });
  });

  it("第 8 回は祝日を飛ばした日", () => {
    const list = classDates(base, "MON", isHoliday);
    expect(resolveSession(base, course, 8, isHoliday)).toMatchObject({ date: list[7] });
  });

  it("学期終了を超えた第 n 回は session_unresolved", () => {
    expect(resolveSession(base, course, 40, isHoliday)).toEqual({
      date: null, reason: "session_unresolved",
    });
  });

  it("曜日が不明なら weekday_unknown", () => {
    expect(resolveSession(base, { weekday: null, firstSessionDate: null }, 3, isHoliday)).toEqual({
      date: null, reason: "weekday_unknown",
    });
  });

  it("firstSessionDate を設定すると起点がずれる", () => {
    const list = classDates(base, "MON", isHoliday);
    const c = { weekday: "MON" as const, firstSessionDate: list[1]! }; // ガイダンス回を除く
    expect(resolveSession(base, c, 1, isHoliday)).toMatchObject({ date: list[1] });
    expect(resolveSession(base, c, 8, isHoliday)).toMatchObject({ date: list[8] });
  });

  it("firstSessionDate が授業日リストに無ければ first_session_not_found", () => {
    const c = { weekday: "MON" as const, firstSessionDate: "2026-11-23" }; // 祝日で授業なし
    expect(resolveSession(base, c, 1, isHoliday)).toEqual({
      date: null, reason: "first_session_not_found",
    });
  });

  it("sessionCount は firstSessionDate 以降の回数", () => {
    const all = sessionCount(base, course, isHoliday)!;
    const list = classDates(base, "MON", isHoliday);
    expect(sessionCount(base, { weekday: "MON", firstSessionDate: list[2]! }, isHoliday))
      .toBe(all - 2);
  });
});
