/**
 * 状態管理と保存（Zustand ＋ AsyncStorage）
 *
 * 保存するのは学期設定・科目・登録した締切。祝日は保存しない（ライブラリから導出する。4.4）。
 * 下書きは確認画面の間だけのものなので保存しない。
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Course, EventType, Semester } from "@syllabus/shared";
import { eventKey, previousKey, type Draft } from "../lib/calendar";

/** カレンダーに登録した課題・試験。ホームの締切一覧と課題チェックリスト（F9）に使う */
export type Deadline = {
  key: string; // eventKey。カレンダーと通知の対応表と同じキー
  course: string;
  title: string;
  type: EventType;
  date: string;
  time: string | null;
  done: boolean;
};

type State = {
  semesters: Semester[];
  currentSemesterId: string | null;
  courses: Course[];
  /** 確認画面（S5）に渡す抽出結果。登録したら捨てる */
  drafts: Draft[];
  deadlines: Deadline[];
  pro: boolean;
  remainingCourses: number; // -1 は無制限（pro）
};

type Actions = {
  currentSemester: () => Semester | null;
  upsertSemester: (s: Semester) => void;
  setCurrentSemester: (id: string) => void;
  upsertCourse: (c: Course) => void;
  setDrafts: (d: Draft[]) => void;
  updateDraft: (id: string, patch: Partial<Draft>) => void;
  addDraft: (d: Draft) => void;
  removeDraft: (id: string) => void;
  clearDrafts: () => void;
  /** 登録した予定のうち課題・試験を締切一覧に入れる。同じキーは上書きし、完了の印は残す */
  upsertDeadlines: (events: Draft[]) => void;
  setDone: (key: string, done: boolean) => void;
  clearDeadlines: () => void;
  setPro: (pro: boolean) => void;
  setRemaining: (n: number) => void;
};

export const useAppStore = create<State & Actions>()(
  persist(
    (set, get) => ({
      semesters: [],
      currentSemesterId: null,
      courses: [],
      drafts: [],
      deadlines: [],
      pro: false,
      remainingCourses: 3,

      currentSemester: () =>
        get().semesters.find((s) => s.id === get().currentSemesterId) ?? null,

      upsertSemester: (s) =>
        set((st) => ({
          semesters: st.semesters.some((x) => x.id === s.id)
            ? st.semesters.map((x) => (x.id === s.id ? s : x))
            : [...st.semesters, s],
          currentSemesterId: st.currentSemesterId ?? s.id,
        })),

      setCurrentSemester: (id) => set({ currentSemesterId: id }),

      upsertCourse: (c) =>
        set((st) => ({
          courses: st.courses.some((x) => x.id === c.id)
            ? st.courses.map((x) => (x.id === c.id ? c : x))
            : [...st.courses, c],
        })),

      setDrafts: (drafts) => set({ drafts }),

      updateDraft: (id, patch) =>
        set((st) => ({ drafts: st.drafts.map((d) => (d.id === id ? { ...d, ...patch } : d)) })),

      addDraft: (d) => set((st) => ({ drafts: [...st.drafts, d] })),

      removeDraft: (id) => set((st) => ({ drafts: st.drafts.filter((d) => d.id !== id) })),

      clearDrafts: () => set({ drafts: [] }),

      upsertDeadlines: (events) =>
        set((st) => {
          const byKey = new Map(st.deadlines.map((d) => [d.key, d]));
          for (const e of events) {
            // 日付の無い予定はカレンダーにも登録しない（calendar.ts）。前の登録もそのままにする
            if (!e.date) continue;
            const key = eventKey(e);
            // 直す前のキーの締切は外す（完了の印だけ引き継ぐ）
            const prev = previousKey(e);
            const before = byKey.get(key) ?? (prev ? byKey.get(prev) : undefined);
            if (prev) byKey.delete(prev);

            // 種別を「その他」に直した予定は締切一覧から外す
            if (e.type !== "assignment" && e.type !== "exam") {
              byKey.delete(key);
              continue;
            }
            byKey.set(key, {
              key,
              course: e.course,
              title: e.title,
              type: e.type,
              date: e.date,
              time: e.time,
              done: before?.done ?? false,
            });
          }
          return { deadlines: [...byKey.values()] };
        }),

      setDone: (key, done) =>
        set((st) => ({ deadlines: st.deadlines.map((d) => (d.key === key ? { ...d, done } : d)) })),

      clearDeadlines: () => set({ deadlines: [] }),

      setPro: (pro) => set({ pro }),

      setRemaining: (remainingCourses) => set({ remainingCourses }),
    }),
    {
      name: "syllabus-calendar",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        semesters: s.semesters,
        currentSemesterId: s.currentSemesterId,
        courses: s.courses,
        deadlines: s.deadlines,
        pro: s.pro,
        remainingCourses: s.remainingCourses,
      }),
    },
  ),
);
