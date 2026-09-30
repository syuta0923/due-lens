import { Stack } from "expo-router";
import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { setupNotifications } from "../lib/notify";
import { configure, fetchIsPro, onProChange } from "../lib/purchases";
import { useAppStore } from "../store/useAppStore";
import { type, useTheme } from "../lib/theme";
import { LogBox } from "react-native";

// デモ動画を開発ビルドで撮るので、画面下の警告バーを出さない（警告はMetroの端末に出る）
LogBox.ignoreAllLogs();

export default function RootLayout() {
  const setPro = useAppStore((s) => s.setPro);
  const { colors, dark } = useTheme();

  useEffect(() => {
    configure();
    setupNotifications();
    // 確かめられなかったとき（null）は保存済みの値を残す。圏外で起動しただけで無料に戻さない
    void fetchIsPro().then((pro) => {
      if (pro !== null) setPro(pro);
    });
    return onProChange(setPro);
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
        <Stack.Screen name="index" options={{ title: "DueLens" }} />
        <Stack.Screen name="semester" options={{ title: "学期の設定" }} />
        <Stack.Screen name="review" options={{ title: "確認・編集" }} />
        <Stack.Screen name="edit" options={{ title: "予定を編集", presentation: "modal" }} />
        <Stack.Screen name="settings" options={{ title: "設定" }} />
        <Stack.Screen name="month" options={{ title: "カレンダー" }} />
      </Stack>
    </>
  );
}
