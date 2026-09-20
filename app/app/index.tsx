/**
 * S3 ホーム
 *
 * 「読み込む」→ 中継 API → 回数を日付に変換 → 確認画面（S5）、という一番細い道。
 * 直近の締切一覧は 9/27 に足す。
 */
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { buildDrafts, type ExtractRequestMeta } from "@syllabus/shared";
import { extract, isSuccess, type Attachment } from "../lib/extract";
import { getDeviceId, todayLocal } from "../lib/device";
import { presentPaywall } from "../lib/purchases";
import { useAppStore } from "../store/useAppStore";

export default function Home() {
  const [busy, setBusy] = useState<string | null>(null);
  const { pro, remainingCourses, setDrafts, setRemaining, setPro } = useAppStore();
  const semester = useAppStore((s) => s.semesters.find((x) => x.id === s.currentSemesterId) ?? null);

  async function onRead() {
    if (!semester) {
      router.push("/semester");
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: 5,
      quality: 1,
    });
    if (picked.canceled) return;

    const attachments: Attachment[] = picked.assets.map((a, i) => ({
      uri: a.uri,
      mimeType: "image/jpeg",
      name: a.fileName ?? `page-${i + 1}.jpg`,
    }));

    setBusy("書類を送信中…");
    const meta: ExtractRequestMeta = {
      deviceId: await getDeviceId(),
      semesterId: semester.id,
      pro,
      today: todayLocal(),
      semester: { start: semester.start, end: semester.end },
    };

    const res = await extract(attachments, meta);
    setBusy(null);

    if (!isSuccess(res)) {
      if (res.code === "paywall_required") {
        const purchased = await presentPaywall();
        if (purchased) setPro(true);
        return;
      }
      Alert.alert("読み込めませんでした", res.message);
      return;
    }

    setRemaining(res.quota.remaining);
    // 回数 → 日付の変換と要確認の判定はここ（アプリ側）で決定的に行う（4.3・4.6）
    setDrafts(buildDrafts(res.extraction, semester));
    router.push("/review");
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.label}>学期</Text>
        <Text style={styles.value}>
          {semester ? `${semester.name}（${semester.start} 〜 ${semester.end}）` : "未設定"}
        </Text>
        <Pressable onPress={() => router.push("/semester")} hitSlop={8}>
          <Text style={styles.link}>{semester ? "学期を編集" : "学期を設定する"}</Text>
        </Pressable>
      </View>

      <Pressable style={styles.primary} onPress={onRead} disabled={busy !== null}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>書類を読み込む</Text>}
      </Pressable>
      {busy ? <Text style={styles.busy}>{busy}</Text> : null}

      <Text style={styles.quota}>
        {pro ? "学期パス：科目数は無制限です" : `無料で読み込める残り：${remainingCourses} 科目`}
      </Text>

      <Pressable onPress={() => router.push("/settings")} hitSlop={8}>
        <Text style={styles.link}>設定</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 16 },
  card: { backgroundColor: "#F4F6FA", borderRadius: 12, padding: 16, gap: 6 },
  label: { fontSize: 12, color: "#667" },
  value: { fontSize: 16, fontWeight: "600" },
  primary: {
    backgroundColor: "#2F6FED",
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: "center",
  },
  primaryText: { color: "#fff", fontSize: 18, fontWeight: "700" },
  busy: { textAlign: "center", color: "#667" },
  quota: { textAlign: "center", color: "#445" },
  link: { color: "#2F6FED", fontWeight: "600" },
});
