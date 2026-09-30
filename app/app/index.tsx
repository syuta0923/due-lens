/**
 * S3 ホーム
 *
 * 「読み込む」→ 中継 API → 回数を日付に変換 → 確認画面（S5）と、登録した締切の一覧。
 *
 * 学期は前に出さない（第5版）。未設定なら今日の日付から仮の学期を作って読み込み、
 * 直したい人は設定から直す。学期は「第n回」を日付に変えるときにしか使わないため。
 */
import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import {
  buildDrafts, daysBetween, defaultSemester, formatJa, type ExtractRequestMeta,
} from "@syllabus/shared";
import { extract, isSuccess, type Attachment } from "../lib/extract";
import { getDeviceId, todayLocal } from "../lib/device";
import { cancelReminders, ensureNotificationPermission, scheduleReminders } from "../lib/notify";
import { presentPaywall } from "../lib/purchases";
import { useAppStore, type Deadline } from "../store/useAppStore";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { shape, spacing, type, useTheme, TOUCH_TARGET } from "../lib/theme";

/** どこから読み込むかを選ばせる。キャンセルなら null */
function chooseSource(): Promise<"camera" | "library" | "pdf" | null> {
  return new Promise((resolve) => {
    Alert.alert(
      "書類を読み込む",
      "課題の案内・シラバス・課題一覧のスクショや写真、PDF から締切を取り出します",
      [
        { text: "カメラで撮る", onPress: () => resolve("camera") },
        { text: "写真・スクショ", onPress: () => resolve("library") },
        { text: "PDF", onPress: () => resolve("pdf") },
      ],
      { cancelable: true, onDismiss: () => resolve(null) },
    );
  });
}

async function pickAttachments(source: "camera" | "library" | "pdf"): Promise<Attachment[] | null> {
  if (source === "pdf") {
    const res = await DocumentPicker.getDocumentAsync({
      type: "application/pdf",
      copyToCacheDirectory: true,
    });
    if (res.canceled) return null;
    return res.assets.map((a) => ({ uri: a.uri, mimeType: "application/pdf", name: a.name }));
  }

  if (source === "camera") {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("カメラの権限が必要です", "設定から許可してください");
      return null;
    }
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1 });
    if (res.canceled) return null;
    return res.assets.map((a, i) => ({
      uri: a.uri,
      mimeType: "image/jpeg",
      name: a.fileName ?? `photo-${i + 1}.jpg`,
    }));
  }

  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: true,
    selectionLimit: 5,
    quality: 1,
  });
  if (res.canceled) return null;
  return res.assets.map((a, i) => ({
    uri: a.uri,
    mimeType: "image/jpeg",
    name: a.fileName ?? `page-${i + 1}.jpg`,
  }));
}

function remainingLabel(date: string, today: string): string {
  const n = daysBetween(today, date);
  if (n < 0) return "期限切れ";
  if (n === 0) return "今日";
  if (n === 1) return "明日";
  return `あと ${n} 日`;
}

export default function Home() {
  const [busy, setBusy] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const { pro, remainingCourses, deadlines, setDrafts, setRemaining, setPro, setDone, upsertSemester } =
    useAppStore();
  const stored = useAppStore((s) => s.semesters.find((x) => x.id === s.currentSemesterId) ?? null);
  const { colors } = useTheme();
  const today = todayLocal();

  async function onRead() {
    const source = await chooseSource();
    if (!source) return;
    const attachments = await pickAttachments(source);
    if (!attachments) return;

    // 学期が未設定なら仮の学期で読み込む（設定しなくても使えるように）
    const semester = stored ?? defaultSemester(today);
    if (!stored) upsertSemester(semester);

    setBusy("書類を送信中…");
    let res: Awaited<ReturnType<typeof extract>>;
    try {
      const meta: ExtractRequestMeta = {
        deviceId: await getDeviceId(),
        semesterId: semester.id,
        pro,
        today,
        semester: { start: semester.start, end: semester.end },
      };
      res = await extract(attachments, meta);
    } catch (e) {
      // extract の中で受け止めるのは通信の失敗だけ。画像の縮小などで落ちても busy のまま固まらないように
      console.warn("[read] 読み込みに失敗", e);
      Alert.alert("読み込めませんでした", "書類を開けませんでした。別の画像や PDF で試してください");
      return;
    } finally {
      setBusy(null);
    }

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
    // 授業日（class）は確認画面にも出さず、登録しない。毎週同じなので時間割で足り、
    // 15 科目 × 30 回の授業が課題と試験の締切を埋もれさせる（第5版）
    setDrafts(buildDrafts(res.extraction, semester, { today }).filter((d) => d.type !== "class"));
    router.push("/review");
  }

  /** 完了の印（F9・有料）。完了にした締切は通知も止める */
  async function onToggle(d: Deadline) {
    if (!pro) {
      const purchased = await presentPaywall();
      if (!purchased) return;
      setPro(true);
    }
    const done = !d.done;
    setDone(d.key, done);
    if (done) await cancelReminders(d.key);
    else if (await ensureNotificationPermission()) await scheduleReminders([d]);
  }

  // 期限切れの未完了も上に残す（見落としに気づけるように）。完了は畳んでおく
  const sorted = [...deadlines].sort((a, b) =>
    `${a.date} ${a.time ?? "99:99"}`.localeCompare(`${b.date} ${b.time ?? "99:99"}`),
  );
  const open = sorted.filter((d) => !d.done);
  const done = sorted.filter((d) => d.done);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Button label="書類を読み込む" onPress={onRead} large busy={busy !== null} />

      <Text style={[type.bodyMedium, styles.status, { color: colors.onSurfaceVariant }]}>
        {busy ??
          (pro ? "学期パス：科目数は無制限です" : `無料で読み込める残り：${remainingCourses} 科目`)}
      </Text>

      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <Text style={[type.titleMedium, { color: colors.onSurface }]}>締切</Text>
          <Button label="月で見る" variant="text" onPress={() => router.push("/month")} />
        </View>
        {open.length === 0 ? (
          <Text style={[type.bodyMedium, { color: colors.onSurfaceVariant }]}>
            {deadlines.length === 0
              ? "課題の案内やシラバスを読み込むと、ここに締切が並びます"
              : "未完了の締切はありません"}
          </Text>
        ) : (
          open.map((d) => (
            <DeadlineRow key={d.key} d={d} today={today} pro={pro} onToggle={() => onToggle(d)} />
          ))
        )}

        {done.length > 0 ? (
          <Pressable onPress={() => setShowDone(!showDone)} hitSlop={8} style={styles.doneToggle}>
            <Text style={[type.labelLarge, { color: colors.primary }]}>
              {showDone ? "完了を隠す" : `完了 ${done.length} 件を表示`}
            </Text>
          </Pressable>
        ) : null}
        {showDone
          ? done.map((d) => (
              <DeadlineRow key={d.key} d={d} today={today} pro={pro} onToggle={() => onToggle(d)} />
            ))
          : null}
      </View>

      <View style={styles.footer}>
        <Button label="設定" onPress={() => router.push("/settings")} variant="text" />
      </View>
    </ScrollView>
  );
}

function DeadlineRow(props: { d: Deadline; today: string; pro: boolean; onToggle: () => void }) {
  const { d, today } = props;
  const { colors } = useTheme();
  const overdue = !d.done && d.date < today;
  const soon = !d.done && daysBetween(today, d.date) <= 1;
  const sub = d.done ? colors.outline : colors.onSurfaceVariant;

  return (
    <Card tone={overdue || soon ? "warn" : "normal"} style={styles.row}>
      <Pressable
        onPress={props.onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: d.done }}
        accessibilityLabel={`${d.title}を${d.done ? "未完了に戻す" : "完了にする"}`}
        hitSlop={8}
        style={styles.checkHit}
      >
        <View
          style={[
            styles.check,
            {
              borderColor: d.done ? colors.primary : colors.outline,
              backgroundColor: d.done ? colors.primary : "transparent",
            },
          ]}
        >
          {d.done ? <Text style={[styles.checkMark, { color: colors.onPrimary }]}>✓</Text> : null}
        </View>
        {/* 無料のときはチェックが有料機能だと分かるように印を付ける */}
        {!props.pro ? <Text style={[type.labelMedium, { color: colors.outline }]}>PRO</Text> : null}
      </Pressable>

      <View style={styles.rowText}>
        <Text
          style={[
            type.bodyLarge,
            styles.rowTitle,
            { color: d.done ? colors.outline : colors.onSurface },
            d.done && styles.strike,
          ]}
        >
          {d.title}
        </Text>
        <Text style={[type.bodyMedium, { color: sub }]}>
          {d.type === "exam" ? "試験 ・ " : ""}
          {d.course}
        </Text>
      </View>

      <View style={styles.rowDate}>
        <Text style={[type.labelLarge, { color: d.done ? colors.outline : colors.onSurface }]}>
          {formatJa(d.date)}
        </Text>
        <Text style={[type.bodySmall, { color: sub }]}>
          {d.time ?? "終日"}
          {d.done ? "" : ` ・ ${remainingLabel(d.date, today)}`}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.lg },
  status: { textAlign: "center" },
  section: { gap: spacing.sm },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  checkHit: {
    minWidth: TOUCH_TARGET - 8,
    minHeight: TOUCH_TARGET - 8,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: shape.xs,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  checkMark: { fontSize: 14, fontWeight: "700", lineHeight: 16 },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontWeight: "600" },
  strike: { textDecorationLine: "line-through" },
  rowDate: { alignItems: "flex-end", gap: 2 },
  doneToggle: { alignSelf: "flex-start", paddingVertical: spacing.xs },
  footer: { alignItems: "center", marginTop: spacing.sm },
});
