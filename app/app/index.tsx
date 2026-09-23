/**
 * S3 ホーム
 *
 * 「読み込む」→ 中継 API → 回数を日付に変換 → 確認画面（S5）、という一番細い道。
 * 直近の締切一覧は 9/27 に足す。
 */
import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { buildDrafts, type ExtractRequestMeta } from "@syllabus/shared";
import { extract, isSuccess, type Attachment } from "../lib/extract";
import { getDeviceId, todayLocal } from "../lib/device";
import { presentPaywall } from "../lib/purchases";
import { useAppStore } from "../store/useAppStore";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { spacing, type, useTheme } from "../lib/theme";

export default function Home() {
  const [busy, setBusy] = useState<string | null>(null);
  const { pro, remainingCourses, setDrafts, setRemaining, setPro } = useAppStore();
  const semester = useAppStore((s) => s.semesters.find((x) => x.id === s.currentSemesterId) ?? null);
  const { colors } = useTheme();

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
      {/* 学期が未設定だと読み込めないので、そのときだけ色を変えて誘導する */}
      <Card tone={semester ? "normal" : "accent"}>
        <Text
          style={[
            type.labelMedium,
            { color: semester ? colors.onSurfaceVariant : colors.onPrimaryContainer },
          ]}
        >
          学期
        </Text>
        <Text
          style={[
            type.titleMedium,
            { color: semester ? colors.onSurface : colors.onPrimaryContainer },
          ]}
        >
          {semester ? semester.name : "未設定"}
        </Text>
        {semester ? (
          <Text style={[type.bodyMedium, { color: colors.onSurfaceVariant }]}>
            {semester.start} 〜 {semester.end}
          </Text>
        ) : (
          <Text style={[type.bodyMedium, { color: colors.onPrimaryContainer }]}>
            開始日と終了日を決めると読み込めます
          </Text>
        )}
        <Pressable
          onPress={() => router.push("/semester")}
          hitSlop={12}
          accessibilityRole="button"
          style={styles.cardLink}
        >
          <Text
            style={[
              type.labelLarge,
              { color: semester ? colors.primary : colors.onPrimaryContainer },
            ]}
          >
            {semester ? "学期を編集" : "学期を設定する"}
          </Text>
        </Pressable>
      </Card>

      <Button
        label="書類を読み込む"
        onPress={onRead}
        large
        busy={busy !== null}
      />

      <Text style={[type.bodyMedium, styles.status, { color: colors.onSurfaceVariant }]}>
        {busy ??
          (pro ? "学期パス：科目数は無制限です" : `無料で読み込める残り：${remainingCourses} 科目`)}
      </Text>

      <View style={styles.footer}>
        <Button label="設定" onPress={() => router.push("/settings")} variant="text" />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.lg },
  cardLink: { marginTop: spacing.sm, alignSelf: "flex-start" },
  status: { textAlign: "center" },
  footer: { alignItems: "center", marginTop: spacing.sm },
});
