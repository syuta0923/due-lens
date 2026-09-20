/** アプリ側のデータ型（仕様書 4.4） */
import type { Weekday } from "./dates";
import type { DateBasis, EventType } from "./schema";

export type { Weekday };

export type MakeupDay = {
  date: string;      // "2026-11-23"
  asWeekday: Weekday; // その日に行う授業の曜日
};

export type Semester = {
  id: string;
  name: string;            // "2026年度 後期"
  start: string;           // "2026-09-28"
  end: string;             // "2027-01-29"
  noClassDates: string[];  // 大学が指定した休業日（祝日は含めない。4.4）
  classHolidays: string[]; // 祝日だが授業を行う日
  makeupDays: MakeupDay[]; // 振替授業日
};

export type Course = {
  id: string;
  semesterId: string;
  name: string;
  weekday: Weekday | null;  // 不明なら null（集中講義など）
  period: number | null;
  startTime: string | null;
  endTime: string | null;
  room: string | null;
  firstSessionDate: string | null; // 第 1 回の日付。未設定なら授業日リストの先頭（4.3）
};

/** 確認画面で「なぜ要確認なのか」を示す理由。アプリ側で計算する（4.6） */
export type ReviewReason =
  | { kind: "weekday_mismatch"; message: string }
  | { kind: "out_of_semester"; message: string }
  | { kind: "date_inferred"; message: string }
  | { kind: "session_unresolved"; message: string }
  | { kind: "weekday_unknown"; message: string }
  | { kind: "quote_mismatch"; message: string }
  | { kind: "time_assumed"; message: string };

export type ReviewReasonKind = ReviewReason["kind"];

export type DraftEvent = {
  id: string;
  courseId: string | null;   // 確認画面で既存科目に紐付けるまで null
  course: string;            // 表示用の科目名
  title: string;
  type: EventType;
  date: string | null;       // 確定しない場合は null
  sessionNumber: number | null;
  time: string | null;
  sourceText: string;
  dateRaw: string | null;
  dateBasis: DateBasis;
  page: number;
  reviewReasons: ReviewReason[]; // 空なら確認不要
};
