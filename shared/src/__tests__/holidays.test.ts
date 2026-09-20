import { describe, expect, it } from "vitest";
import { holidayName, isHoliday } from "../holidays";

/** 2026 年度後期は 2027/1 まで続く。ライブラリに 2027 年のデータが入っているかを確認する */
describe("holidays", () => {
  it("2026 年の祝日", () => {
    expect(isHoliday("2026-11-23")).toBe(true);  // 勤労感謝の日
    expect(isHoliday("2026-11-24")).toBe(false);
    expect(holidayName("2026-11-23")).toBe("勤労感謝の日");
  });

  it("2027 年の祝日（学期末まで対応しているか）", () => {
    expect(isHoliday("2027-01-01")).toBe(true);  // 元日
    expect(isHoliday("2027-01-11")).toBe(true);  // 成人の日
    expect(isHoliday("2027-01-12")).toBe(false);
  });

  it("振替休日", () => {
    expect(isHoliday("2026-05-06")).toBe(true);  // みどりの日の振替休日
  });
});
