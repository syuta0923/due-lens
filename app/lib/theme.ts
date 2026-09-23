/**
 * Material Design 3 のデザイントークン
 *
 * 色・文字・角丸・余白をここ 1 か所に集める。画面ごとに #2F6FED や borderRadius: 12 を
 * 書いていたものを置き換える。shared/src/schema.ts が「AI 出力の唯一の定義」であるのと
 * 同じ考えで、見た目の定義もここだけにする。
 *
 * MD3 の dynamic color（端末の壁紙から配色を作る Material You）は使わない。
 * ネイティブモジュールが要りリビルドが必要になるため、固定のパレットを置く。
 * 配色は既存の青（#2F6FED）を種に、MD3 のトーン構造（40/90/10 …）へ寄せたもの。
 *
 * 「要確認」の橙は MD3 に定義が無い役割なので、同じ組み立て方で自前で足している
 * （error は「失敗」であって「確認してほしい」ではないため、流用しない）。
 */
import { useColorScheme } from "react-native";
import { useMemo } from "react";

export type ColorScheme = {
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  secondaryContainer: string;
  onSecondaryContainer: string;
  error: string;
  errorContainer: string;
  onErrorContainer: string;
  /** 「要確認」用。MD3 標準には無い自前の役割 */
  warningContainer: string;
  onWarningContainer: string;
  warningOutline: string;
  background: string;
  surface: string;
  onSurface: string;
  onSurfaceVariant: string;
  surfaceContainerLow: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  outline: string;
  outlineVariant: string;
};

const light: ColorScheme = {
  primary: "#3B5BA9",
  onPrimary: "#FFFFFF",
  primaryContainer: "#D9E2FF",
  onPrimaryContainer: "#001A41",
  secondaryContainer: "#DBE2F9",
  onSecondaryContainer: "#141B2C",
  error: "#BA1A1A",
  errorContainer: "#FFDAD6",
  onErrorContainer: "#410002",
  warningContainer: "#FFDDB0",
  onWarningContainer: "#2B1700",
  warningOutline: "#B9873C",
  background: "#FDFBFF",
  surface: "#FDFBFF",
  onSurface: "#1B1B1F",
  onSurfaceVariant: "#44474F",
  surfaceContainerLow: "#F7F4FB",
  surfaceContainer: "#F1EEF6",
  surfaceContainerHigh: "#EBE8F0",
  outline: "#74777F",
  outlineVariant: "#C4C6D0",
};

const dark: ColorScheme = {
  primary: "#B0C6FF",
  onPrimary: "#102F60",
  primaryContainer: "#294578",
  onPrimaryContainer: "#D9E2FF",
  secondaryContainer: "#3E4759",
  onSecondaryContainer: "#DBE2F9",
  error: "#FFB4AB",
  errorContainer: "#93000A",
  onErrorContainer: "#FFDAD6",
  warningContainer: "#5C3F00",
  onWarningContainer: "#FFDDB0",
  warningOutline: "#8B6529",
  background: "#111318",
  surface: "#111318",
  onSurface: "#E3E2E9",
  onSurfaceVariant: "#C4C6D0",
  surfaceContainerLow: "#1A1B21",
  surfaceContainer: "#1E1F25",
  surfaceContainerHigh: "#282A2F",
  outline: "#8E9099",
  outlineVariant: "#44474F",
};

/**
 * MD3 のタイプスケール。字間（letterSpacing）は英字向けの値なので、
 * 日本語では広く見えすぎる。0 寄りに詰めてある。
 */
export const type = {
  headlineSmall: { fontSize: 24, lineHeight: 32, fontWeight: "400" },
  titleLarge: { fontSize: 22, lineHeight: 28, fontWeight: "400" },
  titleMedium: { fontSize: 16, lineHeight: 24, fontWeight: "600" },
  bodyLarge: { fontSize: 16, lineHeight: 24, fontWeight: "400" },
  bodyMedium: { fontSize: 14, lineHeight: 20, fontWeight: "400" },
  bodySmall: { fontSize: 12, lineHeight: 16, fontWeight: "400" },
  labelLarge: { fontSize: 14, lineHeight: 20, fontWeight: "600" },
  labelMedium: { fontSize: 12, lineHeight: 16, fontWeight: "600" },
} as const;

/** MD3 の角丸 */
export const shape = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 28,
  full: 999,
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/** 押せるものの最小の高さ。MD3 のタッチターゲットは 48dp */
export const TOUCH_TARGET = 48;

export type Theme = { colors: ColorScheme; dark: boolean };

export function useTheme(): Theme {
  const scheme = useColorScheme();
  const isDark = scheme === "dark";
  return useMemo(() => ({ colors: isDark ? dark : light, dark: isDark }), [isDark]);
}

/**
 * テーマに依存する StyleSheet を組む。配色が変わるたびに作り直すが、
 * それ以外では使い回す。
 */
export function useThemedStyles<T>(factory: (t: Theme) => T): T {
  const theme = useTheme();
  return useMemo(() => factory(theme), [theme, factory]);
}
