/**
 * 採点（仕様書 4.7）
 *
 * 指標は 4.7 のとおり、courses[].name / events[].date / events[].session_number /
 * events[].type のフィールド単位の一致率と、取りこぼし・余計な追加の件数。
 *
 * ## events の突き合わせが要る理由
 *
 * courses は名前で照合できるが、events は配列であって ID が無い。正解の 3 件目と
 * 予測の 1 件目が同じ予定のことがある。だから「どれとどれが同じ予定か」を先に決めないと、
 * date が合っているかどうかすら数えられない。
 *
 * ## 何で対応づけるか
 *
 * **対応づけに使う項目と、採点する項目を分ける。** date で対応づけてから date の一致を
 * 数えれば、必ず 100% になってしまう（循環）。そこで
 *
 *   対応づけ … 科目名と title（＝その予定が「何か」を表す項目）
 *   採点     … date / session_number / type（＝その予定の「値」）
 *
 * とする。date と session_number は同点のときの並べ替えにだけ使う。同じ科目に
 * 「課題提出」が 2 件あるようなケースを、日付で正しい方に寄せるため。
 *
 * ## 貪欲マッチング
 *
 * 全ペアの類似度を出し、高い順に、両方まだ未使用なら対応づける。最適解（ハンガリアン法）
 * ではないが、1 ケースの予定は多くて数十件で、類似度の分布も離れているため差が出ない。
 */
import { normalizeCourseName, sameCourse, type Extraction, type ExtractedEvent } from "@syllabus/shared";

/** これを下回るペアは「別の予定」とみなす。取りこぼし＋余計な追加として数える */
const MATCH_THRESHOLD = 0.45;
/** 対応づけスコアの重み。title を主、科目名を従にする */
const W_TITLE = 0.7;
const W_COURSE = 0.3;

export const SCORED_FIELDS = ["date", "session_number", "type", "date_basis", "course"] as const;
export type ScoredField = (typeof SCORED_FIELDS)[number];

export type EventPair = {
  expected: ExtractedEvent;
  predicted: ExtractedEvent;
  similarity: number;
  fields: Record<ScoredField, boolean>;
};

export type Tally = { hit: number; total: number };

export type CaseScore = {
  courses: { hit: number; total: number; missing: string[]; extra: string[] };
  matched: EventPair[];
  missing: ExtractedEvent[]; // 正解にあるのに予測に無い＝取りこぼし
  extra: ExtractedEvent[];   // 予測にあるのに正解に無い＝余計な追加
  fields: Record<ScoredField, Tally>;
};

// --- 文字列の類似度 -------------------------------------------------------
// 日本語は単語に区切りにくいので、2 文字ずつの並び（bigram）の重なりで測る。
// 「第8回 中間試験」と「中間試験（第8回）」のような揺れを拾える。

function bigrams(s: string): string[] {
  if (s.length <= 1) return s.length === 1 ? [s] : [];
  const out: string[] = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out;
}

/** Dice 係数。0〜1。完全一致で 1 */
export function similarity(a: string, b: string): number {
  const x = normalizeCourseName(a); // 全角/半角・空白・括弧をそろえる。科目名以外にも使える
  const y = normalizeCourseName(b);
  if (x === y) return 1;
  if (x.length === 0 || y.length === 0) return 0;

  const ax = bigrams(x);
  const by = bigrams(y);
  if (ax.length === 0 || by.length === 0) return 0;

  // 同じ bigram が複数回出てもよいように、出現回数を持って消し込む
  const pool = new Map<string, number>();
  for (const g of by) pool.set(g, (pool.get(g) ?? 0) + 1);

  let overlap = 0;
  for (const g of ax) {
    const n = pool.get(g) ?? 0;
    if (n > 0) {
      overlap++;
      pool.set(g, n - 1);
    }
  }
  return (2 * overlap) / (ax.length + by.length);
}

// --- 突き合わせ -----------------------------------------------------------

const courseNameOf = (x: Extraction, i: number): string => x.courses[i]?.name ?? "";

const eq = <T,>(a: T, b: T): boolean => a === b;

export function scoreCase(expected: Extraction, predicted: Extraction): CaseScore {
  // --- courses[].name ---
  const expNames = expected.courses.map((c) => c.name);
  const predNames = predicted.courses.map((c) => c.name);
  const usedPred = new Set<number>();
  const missingCourses: string[] = [];

  for (const name of expNames) {
    const j = predNames.findIndex((p, k) => !usedPred.has(k) && sameCourse(name, p));
    if (j === -1) missingCourses.push(name);
    else usedPred.add(j);
  }
  const extraCourses = predNames.filter((_, k) => !usedPred.has(k));

  // --- events の対応づけ ---
  const candidates: { i: number; j: number; sim: number; tie: number }[] = [];

  expected.events.forEach((e, i) => {
    predicted.events.forEach((p, j) => {
      const sim =
        W_TITLE * similarity(e.title, p.title) +
        W_COURSE *
          similarity(courseNameOf(expected, e.course_index), courseNameOf(predicted, p.course_index));
      if (sim < MATCH_THRESHOLD) return;
      // 同点のときだけ効く。値そのものは採点に使い、対応づけには使わない
      const tie = (eq(e.date, p.date) ? 1 : 0) + (eq(e.session_number, p.session_number) ? 1 : 0);
      candidates.push({ i, j, sim, tie });
    });
  });

  candidates.sort((a, b) => b.sim - a.sim || b.tie - a.tie || a.i - b.i || a.j - b.j);

  const takenExp = new Set<number>();
  const takenPred = new Set<number>();
  const matched: EventPair[] = [];

  for (const c of candidates) {
    if (takenExp.has(c.i) || takenPred.has(c.j)) continue;
    const e = expected.events[c.i];
    const p = predicted.events[c.j];
    if (!e || !p) continue;

    takenExp.add(c.i);
    takenPred.add(c.j);
    matched.push({
      expected: e,
      predicted: p,
      similarity: c.sim,
      fields: {
        date: eq(e.date, p.date),
        session_number: eq(e.session_number, p.session_number),
        type: eq(e.type, p.type),
        date_basis: eq(e.date_basis, p.date_basis),
        course: sameCourse(
          courseNameOf(expected, e.course_index),
          courseNameOf(predicted, p.course_index),
        ),
      },
    });
  }

  const missing = expected.events.filter((_, i) => !takenExp.has(i));
  const extra = predicted.events.filter((_, j) => !takenPred.has(j));

  // --- フィールド単位の一致率（対応づいたペアだけを母数にする） ---
  const fields = Object.fromEntries(
    SCORED_FIELDS.map((f) => [
      f,
      { hit: matched.filter((m) => m.fields[f]).length, total: matched.length },
    ]),
  ) as Record<ScoredField, Tally>;

  return {
    courses: {
      hit: expNames.length - missingCourses.length,
      total: expNames.length,
      missing: missingCourses,
      extra: extraCourses,
    },
    matched,
    missing,
    extra,
    fields,
  };
}

// --- 集計 -----------------------------------------------------------------

export function addTally(a: Tally, b: Tally): Tally {
  return { hit: a.hit + b.hit, total: a.total + b.total };
}

export function rate(t: Tally): number {
  return t.total === 0 ? 1 : t.hit / t.total;
}

export function pct(t: Tally): string {
  return t.total === 0 ? "  －  " : `${(rate(t) * 100).toFixed(1).padStart(5)}%`;
}
