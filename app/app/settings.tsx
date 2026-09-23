/**
 * S7 設定（骨組み）
 *
 * 9/26〜9/27 に、通知タイミング・学期の切り替え・登録先カレンダーの変更を足す。
 */
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { CALENDAR_TITLE, removeAll } from "../lib/calendar";
import { presentPaywall, restore } from "../lib/purchases";
import { useAppStore } from "../store/useAppStore";
import { Card } from "../components/Card";
import { Divider, ListItem } from "../components/ListItem";
import { spacing, type, useTheme } from "../lib/theme";

export default function Settings() {
  const { pro, setPro, remainingCourses } = useAppStore();
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
            setPro(ok);
            Alert.alert(ok ? "復元しました" : "復元できる購入がありませんでした");
          }}
        />
        <Divider />
        <ListItem
          label={`「${CALENDAR_TITLE}」カレンダーを削除する`}
          supporting="このアプリが登録した予定だけがまとめて消えます"
          destructive
          onPress={() =>
            Alert.alert("削除しますか", "登録した予定がまとめて消えます", [
              { text: "キャンセル", style: "cancel" },
              {
                text: "削除",
                style: "destructive",
                onPress: async () => {
                  await removeAll();
                  Alert.alert("削除しました");
                },
              },
            ])
          }
        />
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
