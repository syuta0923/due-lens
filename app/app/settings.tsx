/**
 * S7 設定（骨組み）
 *
 * 9/26〜9/27 に、通知タイミング・学期の切り替え・登録先カレンダーの変更を足す。
 */
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { CALENDAR_TITLE, removeAll } from "../lib/calendar";
import { presentPaywall, restore } from "../lib/purchases";
import { useAppStore } from "../store/useAppStore";

export default function Settings() {
  const { pro, setPro, remainingCourses } = useAppStore();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.label}>プラン</Text>
        <Text style={styles.value}>
          {pro ? "学期パス / 月額（有効）" : `無料（残り ${remainingCourses} 科目）`}
        </Text>
      </View>

      <Row
        label="プランを見る"
        onPress={async () => {
          if (await presentPaywall()) setPro(true);
        }}
      />
      <Row
        label="購入を復元する"
        onPress={async () => {
          const ok = await restore();
          setPro(ok);
          Alert.alert(ok ? "復元しました" : "復元できる購入がありませんでした");
        }}
      />
      <Row
        label={`「${CALENDAR_TITLE}」カレンダーを削除する`}
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

      <Text style={styles.note}>
        審査用に RevenueCat の Test Store で動かしています。本番では Google Play のキーに切り替えます。
      </Text>
    </ScrollView>
  );
}

function Row({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <Text style={styles.rowText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 12 },
  card: { backgroundColor: "#F4F6FA", borderRadius: 12, padding: 16, gap: 4 },
  label: { fontSize: 12, color: "#667" },
  value: { fontSize: 16, fontWeight: "600" },
  row: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#E6E9F0" },
  rowText: { fontSize: 16, color: "#2F6FED" },
  note: { fontSize: 12, color: "#667", lineHeight: 18, marginTop: 12 },
});
