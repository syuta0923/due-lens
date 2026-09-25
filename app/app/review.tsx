/**
 * S5 確認・編集
 *
 * デモ動画の見せ場。登録件数と「カレンダーに追加」を大きく出す。
 * 要確認は「⚠ 要確認」ではなく理由をそのまま出す（4.6）。
 * カードを押すと編集（edit.tsx）、「削除」で外す、「予定を追加」で手で足せる。
 * 第 1 回の上書きはまだ無い。
 */
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { formatJa } from "@syllabus/shared";
import { ensurePermission, planRegistration, register } from "../lib/calendar";
import { ensureNotificationPermission, scheduleReminders } from "../lib/notify";
import { useAppStore } from "../store/useAppStore";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { shape, spacing, type, useTheme } from "../lib/theme";

const TYPE_LABEL = { class: "授業", assignment: "課題", exam: "試験", other: "その他" } as const;

export default function Review() {
  const drafts = useAppStore((s) => s.drafts);
  const { clearDrafts, removeDraft, upsertDeadlines } = useAppStore();
  const [plan, setPlan] = useState({ creates: 0, updates: 0 });
  const [busy, setBusy] = useState(false);
  const { colors } = useTheme();

  useEffect(() => {
    void planRegistration(drafts).then((p) =>
      setPlan({ creates: p.creates.length, updates: p.updates.length }),
    );
  }, [drafts]);

  async function onRegister() {
    if (!(await ensurePermission())) {
      Alert.alert("カレンダーの権限が必要です", "設定から許可してください");
      return;
    }
    setBusy(true);
    const r = await register(drafts);
    upsertDeadlines(drafts);
    // 通知が断られてもカレンダーの登録は済ませる（通知は後から設定で許可できる）
    const notifyOk = await ensureNotificationPermission();
    const n = notifyOk ? await scheduleReminders(drafts) : null;
    setBusy(false);
    Alert.alert(
      "カレンダーに追加しました",
      `新規 ${r.created} 件・更新 ${r.updated} 件${r.skipped ? `・日付未確定 ${r.skipped} 件` : ""}\n` +
        (n ? `締切の前日と当日に通知します（${n.scheduled} 件）` : "通知が許可されていないため、通知は届きません"),
      // 下書きを先に消すと、ダイアログの裏に「日程が見つかりませんでした」が一瞬見えるので、閉じてから消す
      [{ text: "OK", onPress: () => { router.dismissTo("/"); clearDrafts(); } }],
    );
  }

  const warnCount = drafts.filter((d) => d.reviewReasons.length > 0).length;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.list}>
        {drafts.length === 0 ? (
          <Text style={[type.bodyLarge, styles.empty, { color: colors.onSurfaceVariant }]}>
            締切が見つかりませんでした。下の「予定を追加」で手で入れるか、撮り直してください。
          </Text>
        ) : (
          // 何件のうち何件を見ればいいのかを最初に出す（全部を読ませない）
          <Text style={[type.bodyMedium, { color: colors.onSurfaceVariant }]}>
            {warnCount === 0
              ? `${drafts.length} 件すべて問題なさそうです`
              : `${drafts.length} 件のうち ${warnCount} 件は確認してください`}
          </Text>
        )}

        {drafts.map((d) => {
          const warn = d.reviewReasons.length > 0;
          const fg = warn ? colors.onWarningContainer : colors.onSurface;
          const fgSub = warn ? colors.onWarningContainer : colors.onSurfaceVariant;

          return (
            <Pressable
              key={d.id}
              onPress={() => router.push({ pathname: "/edit", params: { id: d.id } })}
              accessibilityRole="button"
              accessibilityHint="押すと編集できます"
            >
            <Card tone={warn ? "warn" : "normal"}>
              <View style={styles.head}>
                <View
                  style={[
                    styles.chip,
                    { backgroundColor: warn ? colors.warningOutline : colors.secondaryContainer },
                  ]}
                >
                  <Text
                    style={[
                      type.labelMedium,
                      { color: warn ? colors.onWarningContainer : colors.onSecondaryContainer },
                    ]}
                  >
                    {TYPE_LABEL[d.type]}
                  </Text>
                </View>
                <Text style={[type.titleMedium, { color: fg }]}>
                  {d.date ? formatJa(d.date) : "日付未確定"}
                  {d.time ? ` ${d.time}` : ""}
                </Text>
              </View>

              <Text style={[type.bodyLarge, styles.title, { color: fg }]}>{d.title}</Text>
              <Text style={[type.bodyMedium, { color: fgSub }]}>
                {d.course}
                {d.sessionNumber ? ` ・ 第${d.sessionNumber}回` : ""}
              </Text>
              <Text style={[type.bodySmall, { color: fgSub }]}>{d.sourceText}</Text>

              {d.reviewReasons.map((r, i) => (
                <Text key={i} style={[type.bodyMedium, styles.reason, { color: fg }]}>
                  ⚠ {r.message}
                </Text>
              ))}

              <View style={styles.actions}>
                <Text style={[type.labelLarge, { color: warn ? colors.onWarningContainer : colors.primary }]}>
                  編集
                </Text>
                <Pressable onPress={() => removeDraft(d.id)} hitSlop={12} accessibilityRole="button">
                  <Text style={[type.labelLarge, { color: colors.error }]}>削除</Text>
                </Pressable>
              </View>
            </Card>
            </Pressable>
          );
        })}

        <Button
          label="＋ 予定を追加"
          variant="tonal"
          onPress={() => router.push({ pathname: "/edit", params: { id: "new" } })}
        />
      </ScrollView>

      <View
        style={[
          styles.bottomBar,
          { backgroundColor: colors.surface, borderTopColor: colors.outlineVariant },
        ]}
      >
        <Button
          label={`カレンダーに追加（新規 ${plan.creates} 件・更新 ${plan.updates} 件）`}
          onPress={onRegister}
          large
          busy={busy}
          disabled={drafts.length === 0}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },
  empty: { textAlign: "center", marginTop: 48 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  chip: {
    borderRadius: shape.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  title: { fontWeight: "600" },
  reason: { marginTop: spacing.xs },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.xl, marginTop: spacing.sm },
  bottomBar: {
    padding: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
