/**
 * RevenueCat（仕様書 6 章）
 *
 * ストアは Test Store（Test API キー）。Google Play Console の登録は不要。
 * 有料機能の判定は entitlement "pro" だけで行う。
 */
import Constants from "expo-constants";
import Purchases, { type CustomerInfo } from "react-native-purchases";
import RevenueCatUI, { PAYWALL_RESULT } from "react-native-purchases-ui";

export const ENTITLEMENT_ID = "pro";

const API_KEY = (Constants.expoConfig?.extra?.revenueCatAndroidKey as string) ?? "";

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
  const result = await RevenueCatUI.presentPaywall({ displayCloseButton: true });
  return result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED;
}

export async function restore(): Promise<boolean> {
  try {
    return isPro(await Purchases.restorePurchases());
  } catch {
    return false;
  }
}
