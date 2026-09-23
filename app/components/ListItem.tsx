/**
 * MD3 のリスト項目
 *
 * 設定画面の行。MD3 の 1 行リストは高さ 56dp、押すと ripple が出る。
 * destructive は削除など戻せない操作で、error 色にする。
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import { spacing, type, useTheme } from "../lib/theme";

export function ListItem(props: {
  label: string;
  /** 補足。何が起きるか一言で添える */
  supporting?: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  const { colors } = useTheme();
  const fg = props.destructive ? colors.error : colors.onSurface;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={props.onPress}
      android_ripple={{ color: colors.outlineVariant }}
      style={styles.row}
    >
      <View style={styles.text}>
        <Text style={[type.bodyLarge, { color: fg }]}>{props.label}</Text>
        {props.supporting ? (
          <Text style={[type.bodyMedium, { color: colors.onSurfaceVariant }]}>
            {props.supporting}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export function Divider() {
  const { colors } = useTheme();
  return <View style={[styles.divider, { backgroundColor: colors.outlineVariant }]} />;
}

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.md,
  },
  text: { gap: 2 },
  divider: { height: StyleSheet.hairlineWidth },
});
