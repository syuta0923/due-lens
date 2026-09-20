/**
 * 採点ロジックのテスト（仕様書 4.7）
 *
 * ここが壊れると eval の数字が静かに嘘になり、モデル選定も長辺の決定も誤る。
 * LLM を呼ばずに検証できる部分なので、テストで固定しておく。
 */
import { describe, expect, it } from "vitest";
import type { Extraction, ExtractedCourse, ExtractedEvent } from "@syllabus/shared";
import { scoreCase, similarity } from "../score";

const course = (name: string): ExtractedCourse => ({
  name,
  weekday: null,
  period: null,
  start_time: null,
  end_time: null,
  room: null,
});

const ev = (o: Partial<ExtractedEvent> & { title: string }): ExtractedEvent => ({
  course_index: 0,
  type: "exam",
  date_raw: null,
  date: null,
  date_basis: "explicit",
  session_number: null,
  time: null,
  source_text: "",
  page: 1,
  ...o,
});

describe("similarity", () => {
  it("語順が入れ替わっても高い類似度になる", () => {
    expect(similarity("第8回 中間試験", "中間試験（第8回）")).toBeGreaterThan(0.8);
  });

  it("全角ローマ数字と半角の違いを吸収する", () => {
    expect(similarity("線形代数学Ⅰ", "線形代数学I")).toBe(1);
  });

  it("別の予定は低い類似度になる", () => {
    expect(similarity("レポート提出", "情報工学概論")).toBeLessThan(0.3);
  });

  it("1 文字でも比較できる", () => {
    expect(similarity("A", "A")).toBe(1);
    expect(similarity("A", "B")).toBe(0);
  });
});

describe("scoreCase", () => {
  it("科目の順序が入れ替わっていても対応づけ、誤った date だけを不一致にする", () => {
    const expected: Extraction = {
      courses: [course("線形代数学Ⅰ"), course("情報工学概論")],
      events: [
        ev({ title: "中間試験", date: "2026-11-10", session_number: 8, type: "exam" }),
        ev({ title: "レポート提出", date: "2026-12-01", type: "assignment" }),
        ev({ title: "期末試験", course_index: 1, date: "2027-01-20", type: "exam" }),
      ],
    };
    // 予測は courses の順序が逆で、中間試験の date が 1 週ずれている
    const predicted: Extraction = {
      courses: [course("情報工学概論"), course("線形代数学I")],
      events: [
        ev({ title: "期末試験", course_index: 0, date: "2027-01-20", type: "exam" }),
        ev({ title: "第8回 中間試験", course_index: 1, date: "2026-11-17", session_number: 8 }),
        ev({ title: "レポート提出", course_index: 1, date: "2026-12-01", type: "assignment" }),
      ],
    };

    const s = scoreCase(expected, predicted);

    expect(s.courses).toMatchObject({ hit: 2, total: 2, missing: [], extra: [] });
    expect(s.matched).toHaveLength(3);
    expect(s.missing).toHaveLength(0);
    expect(s.extra).toHaveLength(0);

    // date は 3 件中 2 件だけ一致。回数と type は全一致
    expect(s.fields.date).toEqual({ hit: 2, total: 3 });
    expect(s.fields.session_number).toEqual({ hit: 3, total: 3 });
    expect(s.fields.type).toEqual({ hit: 3, total: 3 });
    // 科目の紐付けも正しい（course_index の順序が違っても名前で見るため）
    expect(s.fields.course).toEqual({ hit: 3, total: 3 });
  });

  it("同名の予定が 2 件あるとき、date で正しい方に振り分ける", () => {
    const base = [
      ev({ title: "課題提出", date: "2026-10-05", type: "assignment" }),
      ev({ title: "課題提出", date: "2026-11-09", type: "assignment" }),
    ];
    const expected: Extraction = { courses: [course("英語")], events: base };
    const predicted: Extraction = { courses: [course("英語")], events: [...base].reverse() };

    const s = scoreCase(expected, predicted);

    expect(s.matched).toHaveLength(2);
    expect(s.fields.date).toEqual({ hit: 2, total: 2 });
  });

  it("まったく別の予定は対応づけず、取りこぼしと余計な追加として数える", () => {
    const expected: Extraction = {
      courses: [course("英語")],
      events: [ev({ title: "中間試験", date: "2026-11-10" })],
    };
    const predicted: Extraction = {
      courses: [course("英語")],
      events: [ev({ title: "履修登録の締切", date: "2026-10-01" })],
    };

    const s = scoreCase(expected, predicted);

    expect(s.matched).toHaveLength(0);
    expect(s.missing).toHaveLength(1);
    expect(s.extra).toHaveLength(1);
    // 対応づかないと母数が 0 になる。rate() は 0 件を 1（減点しない）として扱う
    expect(s.fields.date).toEqual({ hit: 0, total: 0 });
  });

  it("予定を丸ごと取りこぼした場合を検出する", () => {
    const expected: Extraction = {
      courses: [course("英語")],
      events: [ev({ title: "中間試験", date: "2026-11-10" }), ev({ title: "期末試験", date: "2027-01-20" })],
    };
    const predicted: Extraction = {
      courses: [course("英語")],
      events: [ev({ title: "中間試験", date: "2026-11-10" })],
    };

    const s = scoreCase(expected, predicted);

    expect(s.matched).toHaveLength(1);
    expect(s.missing.map((e) => e.title)).toEqual(["期末試験"]);
    expect(s.extra).toHaveLength(0);
  });

  it("読み取れなかった科目と、でっち上げた科目を区別して数える", () => {
    const expected: Extraction = {
      courses: [course("線形代数学Ⅰ"), course("英語")],
      events: [],
    };
    const predicted: Extraction = {
      courses: [course("線形代数学 I"), course("体育")],
      events: [],
    };

    const s = scoreCase(expected, predicted);

    expect(s.courses.hit).toBe(1);
    expect(s.courses.missing).toEqual(["英語"]);
    expect(s.courses.extra).toEqual(["体育"]);
  });

  it("「第8回」しか書かれていない予定（date が null）も比較できる", () => {
    const expected: Extraction = {
      courses: [course("線形代数学Ⅰ")],
      events: [ev({ title: "中間試験", date: null, session_number: 8, date_basis: "session_only" })],
    };
    // date を勝手に埋めてしまった予測は不一致として出る
    const predicted: Extraction = {
      courses: [course("線形代数学Ⅰ")],
      events: [ev({ title: "中間試験", date: "2026-11-10", session_number: 8, date_basis: "inferred" })],
    };

    const s = scoreCase(expected, predicted);

    expect(s.matched).toHaveLength(1);
    expect(s.fields.date).toEqual({ hit: 0, total: 1 });
    expect(s.fields.session_number).toEqual({ hit: 1, total: 1 });
    expect(s.fields.date_basis).toEqual({ hit: 0, total: 1 });
  });
});
