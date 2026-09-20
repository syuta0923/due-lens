import { describe, expect, it } from "vitest";
import {
  daysInMonth, eachDate, formatJa, isLeapYear, isValidDate, nextDate, weekdayOf,
} from "../dates";

describe("dates", () => {
  it("toISOString のズレが出る日でも日付が動かない", () => {
    // new Date(2026, 9, 20).toISOString().slice(0,10) は JST で "2026-10-19" になる
    expect(weekdayOf("2026-10-20")).toBe("TUE");
    expect(nextDate("2026-10-20")).toBe("2026-10-21");
  });

  it("月末・年またぎ", () => {
    expect(nextDate("2026-12-29")).toBe("2026-12-30");
    expect(nextDate("2026-12-31")).toBe("2027-01-01");
    expect(nextDate("2027-01-31")).toBe("2027-02-01");
    expect(nextDate("2028-02-28")).toBe("2028-02-29"); // 閏年
    expect(nextDate("2027-02-28")).toBe("2027-03-01");
  });

  it("うるう年と月の日数", () => {
    expect(isLeapYear(2028)).toBe(true);
    expect(isLeapYear(2027)).toBe(false);
    expect(isLeapYear(2100)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(daysInMonth(2027, 2)).toBe(28);
  });

  it("曜日（Sakamoto）", () => {
    expect(weekdayOf("2026-09-28")).toBe("MON");
    expect(weekdayOf("2027-01-01")).toBe("FRI");
    expect(weekdayOf("2026-11-23")).toBe("MON");
    expect(weekdayOf("2026-12-31")).toBe("THU");
  });

  it("存在しない日付を弾く", () => {
    expect(isValidDate("2026-02-30")).toBe(false);
    expect(isValidDate("2026-13-01")).toBe(false);
    expect(isValidDate("2026-1-1")).toBe(false);
    expect(isValidDate("2026-01-01")).toBe(true);
  });

  it("eachDate は両端を含む", () => {
    expect([...eachDate("2026-12-30", "2027-01-02")]).toEqual([
      "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02",
    ]);
  });

  it("表示用フォーマット", () => {
    expect(formatJa("2026-11-17")).toBe("11/17（火）");
  });
});
