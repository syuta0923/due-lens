import { Stack } from "expo-router";
import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { configure, fetchIsPro } from "../lib/purchases";
import { useAppStore } from "../store/useAppStore";

export default function RootLayout() {
  const setPro = useAppStore((s) => s.setPro);

  useEffect(() => {
    configure();
    void fetchIsPro().then(setPro);
  }, [setPro]);

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerTitleStyle: { fontSize: 17 } }}>
        <Stack.Screen name="index" options={{ title: "シラバスカレンダー" }} />
        <Stack.Screen name="semester" options={{ title: "学期の設定" }} />
        <Stack.Screen name="review" options={{ title: "確認・編集" }} />
        <Stack.Screen name="settings" options={{ title: "設定" }} />
      </Stack>
    </>
  );
}
