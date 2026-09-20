import { describe, expect, it } from "vitest";
import { normalizeCourseName, sameCourse } from "../normalize";

describe("normalizeCourseName（無料枠のカウント用）", () => {
  it("表記ゆれを同じキーにまとめる", () => {
    expect(sameCourse("線形代数学Ⅰ", "線形代数学I")).toBe(true);
    expect(sameCourse("線形代数学 I", "線形代数学I")).toBe(true);
    expect(sameCourse("線形代数学　Ⅰ", "線形代数学I")).toBe(true);
    expect(sameCourse("ＩＴ基礎", "IT基礎")).toBe(true);
    expect(sameCourse("データ構造（応用）", "データ構造 応用")).toBe(true);
  });

  it("違う科目は区別する", () => {
    expect(sameCourse("線形代数学I", "線形代数学II")).toBe(false);
    expect(sameCourse("英語", "英語表現")).toBe(false);
  });

  it("キーは表示用ではない", () => {
    expect(normalizeCourseName("線形代数学 Ⅰ")).toBe("線形代数学I");
  });
});
