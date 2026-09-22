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
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { isValidDate, type Semester } from "@syllabus/shared";
import { useAppStore } from "../store/useAppStore";

export default function SemesterScreen() {
  const current = useAppStore((s) => s.semesters.find((x) => x.id === s.currentSemesterId) ?? null);
  const upsertSemester = useAppStore((s) => s.upsertSemester);

  const [name, setName] = useState(current?.name ?? "2026年度 後期");
  const [start, setStart] = useState(current?.start ?? "2026-09-28");
  const [end, setEnd] = useState(current?.end ?? "2027-01-29");

  const valid = isValidDate(start) && isValidDate(end) && start < end;

  function onSave() {
    const s: Semester = {
      id: current?.id ?? `sem-${Date.now()}`,
      name,
      start,
      end,
      noClassDates: current?.noClassDates ?? [],
      classHolidays: current?.classHolidays ?? [],
      makeupDays: current?.makeupDays ?? [],
    };
    upsertSemester(s);
    router.back();
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Field label="学期の名前" value={name} onChange={setName} placeholder="2026年度 後期" />
      <Field label="開始日（YYYY-MM-DD）" value={start} onChange={setStart} placeholder="2026-09-28" />
      <Field label="終了日（YYYY-MM-DD）" value={end} onChange={setEnd} placeholder="2027-01-29" />

      <Text style={styles.note}>
        祝日は自動で休講として扱います。大学独自の休講日・振替授業日がある場合は、
        あとから設定で追加できます。先に登録しなくても読み込めます。
      </Text>

      <Pressable style={[styles.primary, !valid && styles.disabled]} onPress={onSave} disabled={!valid}>
        <Text style={styles.primaryText}>保存</Text>
      </Pressable>
    </ScrollView>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        style={styles.input}
        value={props.value}
        onChangeText={props.onChange}
        placeholder={props.placeholder}
        autoCapitalize="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 16 },
  field: { gap: 6 },
  label: { fontSize: 13, color: "#445" },
  input: { borderWidth: 1, borderColor: "#CCD3E0", borderRadius: 10, padding: 12, fontSize: 16 },
  note: { fontSize: 12, color: "#667", lineHeight: 18 },
  primary: { backgroundColor: "#2F6FED", padding: 16, borderRadius: 12, alignItems: "center" },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  disabled: { opacity: 0.4 },
});
