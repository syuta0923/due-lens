/**
 * 端末 ID（仕様書 6.3）
 *
 * 無料枠のカウントのキーに使う。再インストールでリセットされないよう Android ID を使い、
 * 取れない場合だけ AsyncStorage の UUID にフォールバックする。
 *
 * これは自己申告であり偽装できる（6.3 の既知の制約）。アクセス制御の根拠にはしない。
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Application from "expo-application";

const FALLBACK_KEY = "device:id";

let cached: string | null = null;

export async function getDeviceId(): Promise<string> {
  if (cached) return cached;

  const androidId = Application.getAndroidId();
  if (androidId) {
    cached = androidId;
    return androidId;
  }

  const saved = await AsyncStorage.getItem(FALLBACK_KEY);
  if (saved) {
    cached = saved;
    return saved;
  }

  const generated = `dev-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
  await AsyncStorage.setItem(FALLBACK_KEY, generated);
  cached = generated;
  return generated;
}

/** 端末のローカル日付を "YYYY-MM-DD" で返す。toISOString は使わない（4.3） */
export function todayLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
