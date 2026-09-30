import { describe, expect, it } from "vitest";
import { addMonths, inMonth, monthGrid } from "../month";

describe("month", () => {
  it("年またぎで月をずらす", () => {
    expect(addMonths({ y: 2026, m: 12 }, 1)).toEqual({ y: 2027, m: 1 });
    expect(addMonths({ y: 2027, m: 1 }, -1)).toEqual({ y: 2026, m: 12 });
    expect(addMonths({ y: 2026, m: 10 }, -22)).toEqual({ y: 2024, m: 12 });
  });

  it("6 週 × 7 日で、日曜から始まる", () => {
    // 2026-10-01 は木曜。前の 9/27（日）から始まる
    const g = monthGrid({ y: 2026, m: 10 });
    expect(g).toHaveLength(6);
    expect(g.every((w) => w.length === 7)).toBe(true);
    expect(g[0]![0]).toBe("2026-09-27");
    expect(g[0]![4]).toBe("2026-10-01");
    expect(g[5]![6]).toBe("2026-11-07");
  });

  it("1 日が日曜の月は前の月を入れない", () => {
    // 2026-02-01 は日曜
    expect(monthGrid({ y: 2026, m: 2 })[0]![0]).toBe("2026-02-01");
  });

  it("年をまたぐ月（1 月）も前の年の 12 月で埋める", () => {
    // 2027-01-01 は金曜
    expect(monthGrid({ y: 2027, m: 1 })[0]![0]).toBe("2026-12-27");
  });

  it("その月の日かどうか", () => {
    expect(inMonth("2026-10-31", { y: 2026, m: 10 })).toBe(true);
    expect(inMonth("2026-11-01", { y: 2026, m: 10 })).toBe(false);
  });
});
