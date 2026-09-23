import { Stack } from "expo-router";
import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { configure, fetchIsPro } from "../lib/purchases";
import { useAppStore } from "../store/useAppStore";
import { type, useTheme } from "../lib/theme";

export default function RootLayout() {
  const setPro = useAppStore((s) => s.setPro);
  const { colors, dark } = useTheme();

  useEffect(() => {
    configure();
    void fetchIsPro().then(setPro);
  }, [setPro]);

  return (
    <>
      <StatusBar style={dark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.onSurface,
          headerTitleStyle: { ...type.titleLarge, color: colors.onSurface },
          // MD3 は影ではなく面の色で階層を出すので、ヘッダーの影は消す
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" options={{ title: "シラバスカレンダー" }} />
        <Stack.Screen name="semester" options={{ title: "学期の設定" }} />
        <Stack.Screen name="review" options={{ title: "確認・編集" }} />
        <Stack.Screen name="settings" options={{ title: "設定" }} />
      </Stack>
    </>
  );
}
