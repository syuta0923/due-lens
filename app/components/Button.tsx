/**
 * MD3 のボタン（Filled / Tonal / Text）
 *
 * MD3 のボタンは角丸が「full」（高さの半分）で、押したときに ripple が出る。
 * disabled は薄くするのではなく、決まった色（onSurface の 12% / 38%）に置き換える
 * ——opacity を下げると背景まで透けて、下にある文字が見えてしまうため。
 */
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { shape, spacing, type, useTheme, TOUCH_TARGET } from "../lib/theme";

type Variant = "filled" | "tonal" | "text";

export function Button(props: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  /** 画面の主役になるボタンは大きくする（MD3 の 40dp では動画で見えにくい） */
  large?: boolean;
  disabled?: boolean;
  busy?: boolean;
  icon?: ReactNode;
}) {
  const { colors } = useTheme();
  const variant = props.variant ?? "filled";
  const disabled = props.disabled || props.busy;

  const bg = {
    filled: colors.primary,
    tonal: colors.secondaryContainer,
    text: "transparent",
  }[variant];

  const fg = {
    filled: colors.onPrimary,
    tonal: colors.onSecondaryContainer,
    text: colors.primary,
  }[variant];

  // 無効時の色は MD3 の指定どおり。text バリアントは背景を持たない
  const bgDisabled = variant === "text" ? "transparent" : withAlpha(colors.onSurface, 0.12);
  const fgDisabled = withAlpha(colors.onSurface, 0.38);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled), busy: Boolean(props.busy) }}
      onPress={props.onPress}
      disabled={disabled}
      android_ripple={{ color: withAlpha(fg, 0.12), borderless: false }}
      style={[
        styles.base,
        {
          backgroundColor: disabled ? bgDisabled : bg,
          minHeight: props.large ? 56 : TOUCH_TARGET,
          paddingHorizontal: variant === "text" ? spacing.md : spacing.xl,
        },
      ]}
    >
      {props.busy ? (
        <ActivityIndicator color={fgDisabled} />
      ) : (
        <View style={styles.row}>
          {props.icon}
          <Text
            style={[
              props.large ? styles.labelLarge : type.labelLarge,
              { color: disabled ? fgDisabled : fg },
            ]}
          >
            {props.label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: shape.full,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden", // ripple を角丸の内側に収める
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  labelLarge: { fontSize: 17, lineHeight: 24, fontWeight: "600" },
});

/** #RRGGBB に不透明度を足す。state layer と無効色に使う */
function withAlpha(hex: string, alpha: number): string {
  const n = Math.round(alpha * 255).toString(16).padStart(2, "0");
  return `${hex}${n}`;
}
