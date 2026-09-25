import { describe, expect, it } from "vitest";
import { buildDrafts, countReasons, weekdayInRaw } from "../review";
import type { Extraction, ExtractedEvent } from "../schema";
import type { Semester } from "../types";

const HOLIDAYS = new Set(["2026-10-12", "2026-11-03", "2026-11-23", "2027-01-01", "2027-01-11"]);
const isHoliday = (d: string) => HOLIDAYS.has(d);

const sem: Semester = {
  id: "s1", name: "2026年度 後期", start: "2026-09-28", end: "2027-01-29",
  noClassDates: [], classHolidays: [], makeupDays: [],
};

const ev = (o: Partial<ExtractedEvent>): ExtractedEvent => ({
  course_index: 0, title: "レポート1提出", type: "assignment",
  date_raw: null, date: null, date_basis: "explicit",
  session_number: null, time: "23:59", source_text: "", page: 1, ...o,
});

const ext = (events: ExtractedEvent[]): Extraction => ({
  courses: [{
    name: "線形代数学I", weekday: "MON", period: 2,
    start_time: "10:40", end_time: "12:10", room: "A棟201",
  }],
  events,
});

describe("weekdayInRaw", () => {
  it("括弧つきの曜日を拾う", () => {
    expect(weekdayInRaw("10/20（火）")).toBe("TUE");
    expect(weekdayInRaw("10月20日(月)")).toBe("MON");
    expect(weekdayInRaw("11/17 水曜日")).toBe("WED");
    expect(weekdayInRaw("10/20")).toBeNull();
    expect(weekdayInRaw(null)).toBeNull();
  });
});

describe("buildDrafts", () => {
  it("日付が明記されていればそのまま使い、要確認は出ない", () => {
    const [d] = buildDrafts(ext([ev({
      date_raw: "10/20（火）", date: "2026-10-20", source_text: "10/20（火）23:59までにLMSへ提出",
    })]), sem, { isHoliday });
    expect(d!.date).toBe("2026-10-20");
    expect(d!.reviewReasons).toEqual([]);
  });

  it("date_raw の曜日と date が食い違えば weekday_mismatch", () => {
    const [d] = buildDrafts(ext([ev({
      date_raw: "10/20（火）", date: "2025-10-20", source_text: "10/20（火）提出",
    })]), sem, { isHoliday });
    const kinds = d!.reviewReasons.map((r) => r.kind);
    expect(kinds).toContain("weekday_mismatch"); // 2025-10-20 は月曜
    expect(d!.reviewReasons[0]!.message).toContain("月曜");
  });

  it("学期の外でも、今日より後で 1 年以内なら out_of_range は出ない（夏休み課題など）", () => {
    const [d] = buildDrafts(ext([ev({
      date_raw: "9/25", date: "2026-09-25", source_text: "9/25 17:00 最終期限",
    })]), sem, { isHoliday, today: "2026-09-24" });
    expect(d!.reviewReasons).toEqual([]);
  });

  it("過ぎた日付・1 年以上先の日付は out_of_range", () => {
    const [past, far] = buildDrafts(ext([
      ev({ date_raw: "10/20", date: "2025-10-20", source_text: "10/20 提出" }),
      ev({ date_raw: "10/20", date: "2027-10-20", source_text: "10/20 提出" }),
    ]), sem, { isHoliday, today: "2026-09-24" });
    expect(past!.reviewReasons.map((r) => r.kind)).toContain("out_of_range");
    expect(far!.reviewReasons.map((r) => r.kind)).toContain("out_of_range");
  });

  it("today を渡さなければ out_of_range は判定しない", () => {
    const [d] = buildDrafts(ext([ev({
      date_raw: "10/20", date: "2025-10-20", source_text: "10/20 提出",
    })]), sem, { isHoliday });
    expect(d!.reviewReasons).toEqual([]);
  });

  it("第 n 回は日付に変換される", () => {
    const [d] = buildDrafts(ext([ev({
      title: "中間試験", type: "exam", date_basis: "session_only",
      session_number: 8, time: null, source_text: "第8回 中間試験", page: 2,
    })]), sem, { isHoliday });
    expect(d!.date).toBe("2026-11-30"); // 祝日 10/12・11/23 を飛ばした 8 回目の月曜
    expect(d!.reviewReasons).toEqual([]);
  });

  it("学期を超えた第 n 回は session_unresolved", () => {
    const [d] = buildDrafts(ext([ev({
      date_basis: "session_only", session_number: 40, time: null,
    })]), sem, { isHoliday });
    expect(d!.date).toBeNull();
    expect(d!.reviewReasons.map((r) => r.kind)).toContain("session_unresolved");
  });

  it("課題に時刻が無ければ 23:59 を仮置きして time_assumed", () => {
    const [d] = buildDrafts(ext([ev({
      date: "2026-10-20", date_raw: "10/20", time: null, source_text: "10/20 提出",
    })]), sem, { isHoliday });
    expect(d!.time).toBe("23:59");
    expect(d!.reviewReasons.map((r) => r.kind)).toContain("time_assumed");
  });

  it("date_raw が source_text に無ければ quote_mismatch", () => {
    const [d] = buildDrafts(ext([ev({
      date_raw: "10/20（火）", date: "2026-10-20", source_text: "第3回の授業後に提出",
    })]), sem, { isHoliday });
    expect(d!.reviewReasons.map((r) => r.kind)).toContain("quote_mismatch");
  });

  it("date_basis が inferred なら date_inferred", () => {
    const [d] = buildDrafts(ext([ev({
      date: "2026-10-20", date_basis: "inferred", source_text: "次回授業時に提出",
    })]), sem, { isHoliday });
    expect(d!.reviewReasons.map((r) => r.kind)).toContain("date_inferred");
  });

  it("科目の曜日が不明なら weekday_unknown", () => {
    const e = ext([ev({ date_basis: "session_only", session_number: 3, time: null })]);
    e.courses[0]!.weekday = null;
    const [d] = buildDrafts(e, sem, { isHoliday });
    expect(d!.reviewReasons.map((r) => r.kind)).toContain("weekday_unknown");
  });

  it("courseOverrides の firstSessionDate が反映される", () => {
    const e = ext([ev({ date_basis: "session_only", session_number: 1, time: null })]);
    const [d] = buildDrafts(e, sem, {
      isHoliday,
      courseOverrides: [{ weekday: "MON", firstSessionDate: "2026-10-05" }],
    });
    expect(d!.date).toBe("2026-10-05");
  });

  it("countReasons で種別ごとに数えられる（ログ用）", () => {
    const drafts = buildDrafts(ext([
      ev({ date: "2026-10-20", date_raw: "10/20", time: null, source_text: "10/20 提出" }),
      ev({ type: "exam", date_basis: "session_only", session_number: 40, time: null }),
    ]), sem, { isHoliday });
    expect(countReasons(drafts)).toMatchObject({ time_assumed: 1, session_unresolved: 1 });
  });
});
