/**
 * S5 確認・編集
 *
 * デモ動画の見せ場。登録件数と「カレンダーに追加」を大きく出す。
 * 要確認は「⚠ 要確認」ではなく理由をそのまま出す（4.6）。
 * 編集（日付の直し、削除、追加、第 1 回の上書き）は 9/27 に足す。
 */
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { formatJa } from "@syllabus/shared";
import { ensurePermission, planRegistration, register } from "../lib/calendar";
import { useAppStore } from "../store/useAppStore";

const TYPE_LABEL = { class: "授業", assignment: "課題", exam: "試験", other: "その他" } as const;

export default function Review() {
  const drafts = useAppStore((s) => s.drafts);
  const clearDrafts = useAppStore((s) => s.clearDrafts);
  const [plan, setPlan] = useState({ creates: 0, updates: 0 });
  const [busy, setBusy] = useState(false);

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
    setBusy(false);
    clearDrafts();
    Alert.alert(
      "カレンダーに追加しました",
      `新規 ${r.created} 件・更新 ${r.updated} 件${r.skipped ? `・日付未確定 ${r.skipped} 件` : ""}`,
      [{ text: "OK", onPress: () => router.replace("/") }],
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.list}>
        {drafts.length === 0 ? (
          <Text style={styles.empty}>日程が見つかりませんでした。撮り直してください。</Text>
        ) : null}

        {drafts.map((d) => (
          <View key={d.id} style={[styles.card, d.reviewReasons.length > 0 && styles.cardWarn]}>
            <View style={styles.row}>
              <Text style={styles.type}>{TYPE_LABEL[d.type]}</Text>
              <Text style={styles.date}>
                {d.date ? formatJa(d.date) : "日付未確定"}
                {d.time ? ` ${d.time}` : ""}
              </Text>
            </View>
            <Text style={styles.title}>{d.title}</Text>
            <Text style={styles.course}>
              {d.course}
              {d.sessionNumber ? ` ・ 第${d.sessionNumber}回` : ""}
            </Text>
            <Text style={styles.source}>{d.sourceText}</Text>

            {d.reviewReasons.map((r, i) => (
              <Text key={i} style={styles.reason}>
                ⚠ {r.message}
              </Text>
            ))}
          </View>
        ))}
      </ScrollView>

      <Pressable
        style={[styles.primary, (busy || drafts.length === 0) && styles.disabled]}
        onPress={onRegister}
        disabled={busy || drafts.length === 0}
      >
        <Text style={styles.primaryText}>
          カレンダーに追加（新規 {plan.creates} 件・更新 {plan.updates} 件）
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  list: { padding: 16, gap: 12, paddingBottom: 24 },
  empty: { textAlign: "center", color: "#667", marginTop: 40 },
  card: { backgroundColor: "#F4F6FA", borderRadius: 12, padding: 14, gap: 4 },
  cardWarn: { backgroundColor: "#FFF6E5", borderWidth: 1, borderColor: "#F0C36D" },
  row: { flexDirection: "row", justifyContent: "space-between" },
  type: { fontSize: 12, color: "#667" },
  date: { fontSize: 14, fontWeight: "700" },
  title: { fontSize: 16, fontWeight: "600" },
  course: { fontSize: 13, color: "#445" },
  source: { fontSize: 12, color: "#889", marginTop: 4 },
  reason: { fontSize: 13, color: "#A35A00", marginTop: 4 },
  primary: { backgroundColor: "#2F6FED", padding: 18, margin: 16, borderRadius: 12, alignItems: "center" },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  disabled: { opacity: 0.4 },
});
