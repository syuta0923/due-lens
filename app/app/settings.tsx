/**
 * S7 設定（骨組み）
 *
 * 学期はホームから外してここに置く（第5版）。「第n回」を日付に変えるときにしか使わないため。
 * 通知タイミング・登録先カレンダーの変更は今回は入れない（READMEの今後の構想へ）。
 */
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { CALENDAR_TITLE, removeAll } from "../lib/calendar";
import { cancelAllReminders, ensureNotificationPermission, sendTestReminder } from "../lib/notify";
import { presentPaywall, restore } from "../lib/purchases";
import { useAppStore } from "../store/useAppStore";
import { Card } from "../components/Card";
import { Divider, ListItem } from "../components/ListItem";
import { spacing, type, useTheme } from "../lib/theme";

export default function Settings() {
  const { pro, setPro, remainingCourses, clearDeadlines } = useAppStore();
  const semester = useAppStore((s) => s.semesters.find((x) => x.id === s.currentSemesterId) ?? null);
  const { colors } = useTheme();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Card tone={pro ? "accent" : "normal"}>
        <Text
          style={[
            type.labelMedium,
            { color: pro ? colors.onPrimaryContainer : colors.onSurfaceVariant },
          ]}
        >
          プラン
        </Text>
        <Text
          style={[type.titleMedium, { color: pro ? colors.onPrimaryContainer : colors.onSurface }]}
        >
          {pro ? "学期パス / 月額（有効）" : "無料"}
        </Text>
        {!pro ? (
          <Text style={[type.bodyMedium, { color: colors.onSurfaceVariant }]}>
            あと {remainingCourses} 科目まで読み込めます
          </Text>
        ) : null}
      </Card>

      <View style={styles.list}>
        <ListItem
          label="学期"
          supporting={
            semester
              ? `${semester.name}（${semester.start}〜${semester.end}）。「第n回」を日付にするときに使います`
              : "未設定（読み込むと今日の日付から仮の学期を作ります）"
          }
          onPress={() => router.push("/semester")}
        />
        <Divider />
        <ListItem
          label="プランを見る"
          supporting="科目数の制限をなくす"
          onPress={async () => {
            if (await presentPaywall()) setPro(true);
          }}
        />
        <Divider />
        <ListItem
          label="購入を復元する"
          supporting="機種変更したときはこちら"
          onPress={async () => {
            const ok = await restore();
            if (ok === null) {
              Alert.alert("復元できませんでした", "通信できる場所で、もう一度試してください");
              return;
            }
            setPro(ok);
            Alert.alert(ok ? "復元しました" : "復元できる購入がありませんでした");
          }}
        />
        <Divider />
        <ListItem
          label={`「${CALENDAR_TITLE}」カレンダーを削除する`}
          supporting="このアプリが登録した予定と通知がまとめて消えます"
          destructive
          onPress={() =>
            Alert.alert("削除しますか", "登録した予定がまとめて消えます", [
              { text: "キャンセル", style: "cancel" },
              {
                text: "削除",
                style: "destructive",
                onPress: async () => {
                  await removeAll();
                  await cancelAllReminders();
                  clearDeadlines();
                  Alert.alert("削除しました");
                },
              },
            ])
          }
        />
        {__DEV__ ? (
          <>
            <Divider />
            <ListItem
              label="通知を試す（開発用）"
              supporting="10 秒後にテストの通知を 1 件出します"
              onPress={async () => {
                if (!(await ensureNotificationPermission())) {
                  Alert.alert("通知の権限が必要です", "設定から許可してください");
                  return;
                }
                await sendTestReminder();
              }}
            />
          </>
        ) : null}
      </View>

      <Text style={[type.bodySmall, { color: colors.onSurfaceVariant }]}>
        審査用に RevenueCat の Test Store で動かしています。本番では Google Play のキーに切り替えます。
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.lg },
  list: { gap: 0 },
});
