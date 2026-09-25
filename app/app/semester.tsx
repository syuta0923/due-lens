/**
 * S2 学期設定（骨組み）
 *
 * 聞くのは開始日・終了日だけ。**休講日・振替授業日はここでは聞かない**（仕様書 2）。
 * 手で写す手間を省くアプリが、使う前に学年暦を手で写させたら本末転倒になるため。
 * 空でも effectiveWeekday が祝日を自動判定するので破綻しない（4.3）。
 *
 * 追加したい人向けの導線は設定（S7）に置く。本来の埋め方は F12（学年暦を撮って取り込む）。
 * 祝日は保存せず holiday_jp から導出する（4.4）。
 */
import { useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { router } from "expo-router";
import { defaultSemester, isValidDate, type Semester } from "@syllabus/shared";
import { todayLocal } from "../lib/device";
import { useAppStore } from "../store/useAppStore";
import { Button } from "../components/Button";
import { TextField } from "../components/TextField";
import { spacing, type, useTheme } from "../lib/theme";

export default function SemesterScreen() {
  const current = useAppStore((s) => s.semesters.find((x) => x.id === s.currentSemesterId) ?? null);
  const upsertSemester = useAppStore((s) => s.upsertSemester);
  const { colors } = useTheme();

  // 未設定なら、読み込み時に作るのと同じ仮の学期を初期値にする
  const base = current ?? defaultSemester(todayLocal());
  const [name, setName] = useState(base.name);
  const [start, setStart] = useState(base.start);
  const [end, setEnd] = useState(base.end);

  // 何が悪いのかをその場で出す。保存ボタンが押せない理由が分からないのを避ける
  const startError = isValidDate(start) ? undefined : "YYYY-MM-DD の形式で入力してください";
  const endError = !isValidDate(end)
    ? "YYYY-MM-DD の形式で入力してください"
    : start < end
      ? undefined
      : "開始日より後の日付にしてください";
  const valid = !startError && !endError;

  function onSave() {
    const s: Semester = {
      // id は変えない。無料枠（6.3）のキーなので、日付を直しただけで枠がリセットされないように
      id: base.id,
      name,
      start,
      end,
      noClassDates: base.noClassDates,
      classHolidays: base.classHolidays,
      makeupDays: base.makeupDays,
    };
    upsertSemester(s);
    router.back();
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <TextField label="学期の名前" value={name} onChange={setName} placeholder="2026年度 後期" />
      <TextField
        label="開始日"
        value={start}
        onChange={setStart}
        placeholder="2026-09-28"
        error={startError}
      />
      <TextField
        label="終了日"
        value={end}
        onChange={setEnd}
        placeholder="2027-01-29"
        error={endError}
      />

      <Text style={[type.bodyMedium, { color: colors.onSurfaceVariant }]}>
        祝日は自動で休講として扱います。大学独自の休講日・振替授業日がある場合は、
        あとから設定で追加できます。先に登録しなくても読み込めます。
      </Text>

      <Button label="保存" onPress={onSave} large disabled={!valid} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.lg },
});
