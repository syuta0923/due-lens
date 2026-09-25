/**
 * 「要確認」の判定と、抽出結果 → 確認画面用データへの変換（仕様書 4.3 / 4.6）
 *
 * 要確認かどうかは LLM のスコアではなくこのコードで判定し、理由（ReviewReason）を添えて渡す。
 * 確認画面では「⚠ 要確認」ではなく「⚠ 10/20（火）とありますが、2026-10-20 は日曜です」と出す。
 */
import {
  KANJI_TO_WEEKDAY, WEEKDAY_TO_KANJI, formatJa, isValidDate, parseDate, formatDate, weekdayOf,
} from "./dates";
import { isHoliday as defaultIsHoliday, type IsHolidayFn } from "./holidays";
import { resolveSession } from "./schedule";
import type { Extraction, ExtractedCourse, ExtractedEvent } from "./schema";
import type { Course, DraftEvent, ReviewReason, Semester } from "./types";

/** 締切時刻が書かれていない課題に仮置きする時刻 */
export const ASSUMED_DEADLINE_TIME = "23:59";

const stripForQuote = (s: string) => s.normalize("NFKC").replace(/[\s　]/g, "");

/** date_raw に曜日が書かれていれば取り出す："10/20（火）" → "TUE" */
export function weekdayInRaw(dateRaw: string | null): ReturnType<typeof weekdayOf> | null {
  if (!dateRaw) return null;
  const m = /[（(]?\s*([月火水木金土日])\s*(?:曜日?)?\s*[）)]?/.exec(dateRaw);
  return m ? KANJI_TO_WEEKDAY[m[1]!] ?? null : null;
}

/** "YYYY-MM-DD" の n 年後（2/29 は 2/28 に丸める） */
function addYears(date: string, n: number): string {
  const { y, m, d } = parseDate(date);
  const target = { y: y + n, m, d };
  return isValidDate(formatDate(target)) ? formatDate(target) : formatDate({ ...target, d: d - 1 });
}

type ResolvedEvent = {
  date: string | null;
  sessionFailure: "weekday_unknown" | "session_unresolved" | "first_session_not_found" | null;
};

/** date / session_number から実際の日付を決める（4.3） */
function resolveDate(
  ev: ExtractedEvent,
  course: Pick<Course, "weekday" | "firstSessionDate">,
  sem: Semester,
  isHoliday: IsHolidayFn,
): ResolvedEvent {
  if (ev.date && isValidDate(ev.date)) return { date: ev.date, sessionFailure: null };
  if (ev.session_number == null) return { date: null, sessionFailure: "session_unresolved" };

  const r = resolveSession(sem, course, ev.session_number, isHoliday);
  return r.date !== null
    ? { date: r.date, sessionFailure: null }
    : { date: null, sessionFailure: r.reason };
}

/** 1 件分の要確認理由を並べる */
export function reviewReasons(
  ev: ExtractedEvent,
  resolved: ResolvedEvent,
  today: string | null,
): ReviewReason[] {
  const out: ReviewReason[] = [];

  // date_raw の曜日と date の曜日が一致しない（年の取り違え・日付の捏造を検出する）
  const rawWd = weekdayInRaw(ev.date_raw);
  if (rawWd && ev.date && isValidDate(ev.date)) {
    const actual = weekdayOf(ev.date);
    if (actual !== rawWd) {
      out.push({
        kind: "weekday_mismatch",
        message: `「${ev.date_raw}」とありますが、${ev.date} は${WEEKDAY_TO_KANJI[actual]}曜です`,
      });
    }
  }

  // 学期の範囲では判定しない。夏休み課題のように学期の外にある締切は普通にある（第5版）。
  // 見たいのは年の読み違いなので、今日から見て「もう過ぎている」「1 年以上先」を拾う
  if (resolved.date && today) {
    if (resolved.date < today) {
      out.push({
        kind: "out_of_range",
        message: `${formatJa(resolved.date)} はすでに過ぎています。年を読み違えていないか確かめてください`,
      });
    } else if (resolved.date > addYears(today, 1)) {
      out.push({
        kind: "out_of_range",
        message: `${resolved.date} は 1 年以上先です。年を読み違えていないか確かめてください`,
      });
    }
  }

  if (ev.date_basis === "inferred") {
    out.push({ kind: "date_inferred", message: "日付が書類に明記されておらず、推測されています" });
  }

  if (resolved.sessionFailure === "weekday_unknown") {
    out.push({
      kind: "weekday_unknown",
      message: ev.session_number
        ? `科目の曜日が分からないため、第${ev.session_number}回を日付にできません。押して日付を入力してください`
        : "科目の曜日が分かりません。押して日付を入力してください",
    });
  } else if (resolved.sessionFailure === "session_unresolved") {
    out.push({
      kind: "session_unresolved",
      message: ev.session_number
        ? `第${ev.session_number}回が学期内に見つかりません。押して日付を入力してください`
        : "日付が書かれていませんでした。押して日付を入力してください",
    });
  } else if (resolved.sessionFailure === "first_session_not_found") {
    out.push({
      kind: "session_unresolved",
      message: "第 1 回に指定した日が授業日リストにありません。第 1 回を選び直してください",
    });
  }

  // date_raw は書類の文字列をそのまま写させている。source_text に無ければ LLM の作文を疑う
  if (ev.date_raw && !stripForQuote(ev.source_text).includes(stripForQuote(ev.date_raw))) {
    out.push({
      kind: "quote_mismatch",
      message: `「${ev.date_raw}」が元の記述に見当たりません`,
    });
  }

  if (ev.type === "assignment" && ev.time == null) {
    out.push({
      kind: "time_assumed",
      message: `締切時刻が書かれていないため ${ASSUMED_DEADLINE_TIME} としました`,
    });
  }

  return out;
}

export type BuildOptions = {
  isHoliday?: IsHolidayFn;
  /** 既存科目に紐付いている場合、course_index → Course（firstSessionDate を反映するため） */
  courseOverrides?: (Pick<Course, "weekday" | "firstSessionDate"> | undefined)[];
  makeId?: (i: number) => string;
  /** 今日（"YYYY-MM-DD"）。過ぎた日付・遠すぎる日付の判定に使う。無ければ判定しない */
  today?: string;
};

/** 抽出結果を確認画面（S5）用の DraftEvent に変換する */
export function buildDrafts(
  extraction: Extraction,
  sem: Semester,
  opts: BuildOptions = {},
): DraftEvent[] {
  const isHoliday = opts.isHoliday ?? defaultIsHoliday;
  const makeId = opts.makeId ?? ((i: number) => `draft-${i}`);

  return extraction.events.map((ev, i) => {
    const ec: ExtractedCourse | undefined = extraction.courses[ev.course_index];
    const override = opts.courseOverrides?.[ev.course_index];
    const course = {
      weekday: override?.weekday ?? ec?.weekday ?? null,
      firstSessionDate: override?.firstSessionDate ?? null,
    };

    const resolved = resolveDate(ev, course, sem, isHoliday);

    return {
      id: makeId(i),
      courseId: null,
      course: ec?.name ?? "(科目不明)",
      title: ev.title,
      type: ev.type,
      date: resolved.date,
      sessionNumber: ev.session_number,
      time: ev.time ?? (ev.type === "assignment" ? ASSUMED_DEADLINE_TIME : null),
      sourceText: ev.source_text,
      dateRaw: ev.date_raw,
      dateBasis: ev.date_basis,
      page: ev.page,
      reviewReasons: reviewReasons(ev, resolved, opts.today ?? null),
    } satisfies DraftEvent;
  });
}

/** ログ用（7.5）：理由の種別ごとの件数 */
export function countReasons(drafts: DraftEvent[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of drafts) for (const r of d.reviewReasons) out[r.kind] = (out[r.kind] ?? 0) + 1;
  return out;
}
