/**
 * RevenueCat（仕様書 6 章）
 *
 * ストアは Test Store（Test API キー）。Google Play Console の登録は不要。
 * 有料機能の判定は entitlement "pro" だけで行う。
 */
import Constants from "expo-constants";
import { Alert } from "react-native";
import Purchases, { type CustomerInfo } from "react-native-purchases";
import RevenueCatUI, { PAYWALL_RESULT } from "react-native-purchases-ui";

export const ENTITLEMENT_ID = "pro";

const RAW_KEY = (Constants.expoConfig?.extra?.revenueCatAndroidKey as string) ?? "";
// app.json の見本の値（test_REPLACE_ME）のままなら、キーが無いものとして扱う
const API_KEY = RAW_KEY.includes("REPLACE_ME") ? "" : RAW_KEY;

let configured = false;

export function configure(): void {
  if (configured || !API_KEY) return;
  Purchases.configure({ apiKey: API_KEY });
  configured = true;
}

export function isPro(info: CustomerInfo | null): boolean {
  return Boolean(info?.entitlements.active[ENTITLEMENT_ID]);
}

export async function fetchIsPro(): Promise<boolean> {
  if (!API_KEY) return false;
  try {
    return isPro(await Purchases.getCustomerInfo());
  } catch {
    return false;
  }
}

/** ペイウォール（S6）。無料枠を使い切ったとき・有料機能をタップしたとき・設定画面から */
export async function presentPaywall(): Promise<boolean> {
  if (!configured) {
    // キーが未設定のまま Paywall を開くと SDK が落ちる。無料枠 → ペイウォールの流れまでは確かめられるように止める
    Alert.alert("プランを表示できません", __DEV__ ? "[開発用] RevenueCat のキーが未設定です（app.json の revenueCatAndroidKey）" : "時間をおいて試してください");
    return false;
  }
  try {
    const result = await RevenueCatUI.presentPaywall({ displayCloseButton: true });
    return result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED;
  } catch (e) {
    console.warn("[purchases] ペイウォールを開けません", e);
    return false;
  }
}

export async function restore(): Promise<boolean> {
  if (!configured) return false;
  try {
    return isPro(await Purchases.restorePurchases());
  } catch {
    return false;
  }
}
