import { describe, expect, it } from "vitest";
import { defaultSemester } from "../semester";

describe("defaultSemester", () => {
  it("4〜8 月は前期", () => {
    expect(defaultSemester("2026-05-10")).toMatchObject({ id: "auto-2026-1", start: "2026-04-08" });
  });

  it("9〜12 月はその年度の後期", () => {
    expect(defaultSemester("2026-09-25")).toMatchObject({
      id: "auto-2026-2", start: "2026-10-01", end: "2027-02-10",
    });
  });

  it("1〜3 月は前の年度の後期（id が年をまたいでも変わらない）", () => {
    expect(defaultSemester("2027-01-15").id).toBe(defaultSemester("2026-11-01").id);
  });
});
