/**
 * AI 抽出の出力スキーマ（仕様書 4.2）
 *
 * このファイルがアプリ・中継 API・eval から参照される唯一の定義。
 * ここから ①LLM への出力形式の指定 ②実行時の検証 ③TypeScript の型 をすべて導出する。
 *
 * 方針：optional ではなく nullable を使う／ユニオンと深いネストを避けフラットに保つ。
 */
import { z } from "zod";

export const WeekdaySchema = z.enum(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]);
export const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:MM 形式");
export const ISODate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 形式");

export const EventType = z.enum(["class", "assignment", "exam", "other"]);
export const DateBasis = z.enum(["explicit", "inferred", "session_only"]);

export const CourseSchema = z.object({
  name: z.string(),
  weekday: WeekdaySchema.nullable(),
  period: z.number().int().min(1).max(8).nullable(),
  start_time: HHMM.nullable(),
  end_time: HHMM.nullable(),
  room: z.string().nullable(),
});

export const EventSchema = z.object({
  course_index: z.number().int().min(0),
  title: z.string(),
  type: EventType,
  date_raw: z.string().nullable(),
  date: ISODate.nullable(),
  date_basis: DateBasis,
  session_number: z.number().int().min(1).max(40).nullable(),
  time: HHMM.nullable(),
  source_text: z.string(),
  page: z.number().int().min(1),
});

export const Extraction = z.object({
  courses: z.array(CourseSchema).min(1),
  events: z.array(EventSchema),
});

export type Extraction = z.infer<typeof Extraction>;
export type ExtractedCourse = z.infer<typeof CourseSchema>;
export type ExtractedEvent = z.infer<typeof EventSchema>;
export type EventType = z.infer<typeof EventType>;
export type DateBasis = z.infer<typeof DateBasis>;
