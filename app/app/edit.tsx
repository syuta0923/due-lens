/**
 * S5 の編集（確認画面から開く）
 *
 * 1 件の予定の種別・予定名・科目・日付・時刻を直す。id が "new" なら追加。
 * 利用者が自分で直した予定は確かめ済みとみなし、要確認の理由を消す。
 * 日付が空のままなら登録できないので、その理由だけは残す。
 */
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { isValidDate, type DraftEvent, type EventType } from "@syllabus/shared";
import { useAppStore } from "../store/useAppStore";
import { Button } from "../components/Button";
import { TextField } from "../components/TextField";
import { shape, spacing, type, useTheme } from "../lib/theme";

const TYPES: { value: EventType; label: string }[] = [
  { value: "assignment", label: "課題" },
  { value: "exam", label: "試験" },
  { value: "other", label: "その他" },
];

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export default function EditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const existing = useAppStore((s) => s.drafts.find((d) => d.id === id) ?? null);
  const { updateDraft, addDraft, removeDraft } = useAppStore();
  const { colors } = useTheme();

  const [kind, setKind] = useState<EventType>(existing?.type ?? "assignment");
  const [title, setTitle] = useState(existing?.title ?? "");
  const [course, setCourse] = useState(existing?.course ?? "");
  const [date, setDate] = useState(existing?.date ?? "");
  const [time, setTime] = useState(existing?.time ?? "");

  const titleError = title.trim() ? undefined : "予定名を入力してください";
  const dateError =
    date === "" || isValidDate(date) ? undefined : "YYYY-MM-DD の形式で入力してください（例 2026-10-20）";
  const timeError = time === "" || HHMM.test(time) ? undefined : "HH:MM の形式で入力してください（例 23:59）";
  const valid = !titleError && !dateError && !timeError;

  function onSave() {
    const patch: Partial<DraftEvent> = {
      type: kind,
      title: title.trim(),
      course: course.trim() || "(科目なし)",
      date: date || null,
      time: time || null,
      reviewReasons: date
        ? []
        : [{ kind: "session_unresolved", message: "日付が未入力です。日付を入れると登録できます" }],
    };

    if (existing) {
      updateDraft(existing.id, patch);
    } else {
      addDraft({
        id: `manual-${Date.now()}`,
        courseId: null,
        sessionNumber: null,
        sourceText: "手で追加",
        dateRaw: null,
        dateBasis: "explicit",
        page: 1,
        ...(patch as Required<Pick<DraftEvent, "type" | "title" | "course" | "date" | "time" | "reviewReasons">>),
      });
    }
    router.back();
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.chips}>
        {TYPES.map((t) => {
          const selected = t.value === kind;
          return (
            <Pressable
              key={t.value}
              onPress={() => setKind(t.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={[
                styles.chip,
                {
                  backgroundColor: selected ? colors.secondaryContainer : "transparent",
                  borderColor: selected ? colors.secondaryContainer : colors.outline,
                },
              ]}
            >
              <Text
                style={[
                  type.labelLarge,
                  { color: selected ? colors.onSecondaryContainer : colors.onSurfaceVariant },
                ]}
              >
                {selected ? "✓ " : ""}
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <TextField label="予定名" value={title} onChange={setTitle} placeholder="レポート1提出" error={titleError} />
      <TextField label="科目" value={course} onChange={setCourse} placeholder="総合英語Ⅱ" />
      <TextField
        label="日付"
        value={date}
        onChange={setDate}
        placeholder="2026-10-20"
        error={dateError}
        keyboardType="numbers-and-punctuation"
      />
      <TextField
        label="時刻（空欄なら終日）"
        value={time}
        onChange={setTime}
        placeholder="23:59"
        error={timeError}
        keyboardType="numbers-and-punctuation"
      />

      {existing?.sourceText && existing.sourceText !== "手で追加" ? (
        <Text style={[type.bodySmall, { color: colors.onSurfaceVariant }]}>
          元の記述：{existing.sourceText}
        </Text>
      ) : null}

      <Button label="保存" onPress={onSave} large disabled={!valid} />
      {existing ? (
        <Button
          label="この予定を削除"
          variant="text"
          onPress={() => {
            removeDraft(existing.id);
            router.back();
          }}
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.lg },
  chips: { flexDirection: "row", gap: spacing.sm },
  chip: {
    borderWidth: 1,
    borderRadius: shape.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
});
