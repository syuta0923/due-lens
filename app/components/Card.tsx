/**
 * MD3 のカード
 *
 * MD3 は影より「面の重なり」で階層を出す。surfaceContainer 系の色を使い、
 * 影は使わない（Elevated ではなく Filled カード）。
 * tone で色を変えて、通常・強調・要確認を同じ形のまま描き分ける。
 */
import type { ReactNode } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { shape, spacing, useTheme } from "../lib/theme";

export function Card(props: {
  children: ReactNode;
  /** normal: 面の上の面 / accent: 主役 / warn: 要確認（4.6） */
  tone?: "normal" | "accent" | "warn";
  style?: ViewStyle;
}) {
  const { colors } = useTheme();
  const tone = props.tone ?? "normal";

  const background = {
    normal: colors.surfaceContainerLow,
    accent: colors.primaryContainer,
    warn: colors.warningContainer,
  }[tone];

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: background },
        // 要確認だけは枠線も付ける。色が見分けにくい環境でも形で分かるように
        tone === "warn" && { borderWidth: 1, borderColor: colors.warningOutline },
        props.style,
      ]}
    >
      {props.children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: shape.md,
    padding: spacing.lg,
    gap: spacing.xs,
  },
});
