/**
 * MD3 の Outlined text field
 *
 * フォーカスすると枠線が primary の 2px になり、ラベルも primary になる。
 * エラー時は error 色にして、下に理由を出す（日付の書式ミスをその場で伝える）。
 */
import { useState } from "react";
import { StyleSheet, Text, TextInput, View, type KeyboardTypeOptions } from "react-native";
import { shape, spacing, type, useTheme, TOUCH_TARGET } from "../lib/theme";

export function TextField(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** 入力が不正なときの理由。あると枠線と文字が error 色になる */
  error?: string;
  keyboardType?: KeyboardTypeOptions;
}) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);

  const borderColor = props.error
    ? colors.error
    : focused
      ? colors.primary
      : colors.outline;

  const labelColor = props.error
    ? colors.error
    : focused
      ? colors.primary
      : colors.onSurfaceVariant;

  return (
    <View style={styles.wrap}>
      <Text style={[type.bodySmall, { color: labelColor }]}>{props.label}</Text>
      <TextInput
        style={[
          styles.input,
          type.bodyLarge,
          {
            borderColor,
            borderWidth: focused || props.error ? 2 : 1,
            color: colors.onSurface,
            backgroundColor: colors.surface,
            // 枠線が 1px ↔ 2px で太さが変わっても中身が動かないように詰める
            paddingHorizontal: focused || props.error ? spacing.lg - 1 : spacing.lg,
          },
        ]}
        value={props.value}
        onChangeText={props.onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={props.placeholder}
        placeholderTextColor={colors.outline}
        keyboardType={props.keyboardType}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {props.error ? (
        <Text style={[type.bodySmall, { color: colors.error }]}>{props.error}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  input: {
    minHeight: TOUCH_TARGET + 8,
    borderRadius: shape.xs,
    paddingVertical: spacing.md,
  },
});
