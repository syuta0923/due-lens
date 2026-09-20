/**
 * 状態管理と保存（Zustand ＋ AsyncStorage）
 *
 * 保存するのは学期設定・科目・下書き。祝日は保存しない（ライブラリから導出する。4.4）。
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Course, DraftEvent, Semester } from "@syllabus/shared";

type State = {
  semesters: Semester[];
  currentSemesterId: string | null;
  courses: Course[];
  /** 確認画面（S5）に渡す抽出結果。登録したら捨てる */
  drafts: DraftEvent[];
  pro: boolean;
  remainingCourses: number; // -1 は無制限（pro）
};

type Actions = {
  currentSemester: () => Semester | null;
  upsertSemester: (s: Semester) => void;
  setCurrentSemester: (id: string) => void;
  upsertCourse: (c: Course) => void;
  setDrafts: (d: DraftEvent[]) => void;
  updateDraft: (id: string, patch: Partial<DraftEvent>) => void;
  removeDraft: (id: string) => void;
  clearDrafts: () => void;
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

      removeDraft: (id) => set((st) => ({ drafts: st.drafts.filter((d) => d.id !== id) })),

      clearDrafts: () => set({ drafts: [] }),

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
        pro: s.pro,
        remainingCourses: s.remainingCourses,
      }),
    },
  ),
);
