/**
 * モデル ID からプロバイダを選ぶ（仕様書 7.2）
 *
 * Worker（本番）と eval（4.7）の両方がここを通る。extract.ts と同じ理由で、
 * 「eval で測ったモデル」と「本番で動くモデル」がずれないようにするため。
 *
 * なぜ 2 社を並べているか：
 *   Gemini API の規約は 18 歳以上で、保護者の同意による例外がない。開発者がこれを
 *   満たせないため、既定を OpenAI にしている（OpenAI は保護者の許可があれば 13 歳以上）。
 *   ただし Gemini 側の実装は消していない。条件が変われば MODEL を 1 行変えるだけで戻せる。
 *
 * zod スキーマ 1 本から構造化出力を導出する設計（7.2）なので、プロバイダが変わっても
 * prompt.ts / validate.ts / schema.ts は一切変わらない。
 */
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { generateObject } from "ai";

type GenerateObjectOptions = Parameters<typeof generateObject>[0];
type Model = GenerateObjectOptions["model"];
/** AI SDK 側の型に合わせる。extract.ts の runExtraction がそのまま受け取れるように */
type ProviderOptions = GenerateObjectOptions["providerOptions"];

export type ApiKeys = {
  readonly OPENAI_API_KEY?: string | undefined;
  readonly GOOGLE_GENERATIVE_AI_API_KEY?: string | undefined;
};

export type ProviderName = "openai" | "google";

/** gemini-* だけ Google。それ以外（gpt-*, o*）は OpenAI */
export function providerOf(modelId: string): ProviderName {
  return modelId.startsWith("gemini-") ? "google" : "openai";
}

/** そのプロバイダが使う環境変数名。エラー文と .dev.vars の案内に使う */
export function apiKeyNameOf(modelId: string): keyof ApiKeys {
  return providerOf(modelId) === "google"
    ? "GOOGLE_GENERATIVE_AI_API_KEY"
    : "OPENAI_API_KEY";
}

export function modelFor(modelId: string, keys: ApiKeys): Model {
  const name = apiKeyNameOf(modelId);
  const apiKey = keys[name];
  if (!apiKey) {
    throw new Error(`${modelId} には ${name} が必要です`);
  }
  return providerOf(modelId) === "google"
    ? createGoogleGenerativeAI({ apiKey })(modelId)
    : createOpenAI({ apiKey })(modelId);
}

/**
 * 思考トークンを抑える指定（7.3）。出力料金には思考分も含まれるため低く抑える。
 *
 * 指定方法がプロバイダごとに違い、gpt-4o-mini のような非 reasoning モデルには
 * そもそも概念がない。ここで吸収し、呼び出し側は budget を渡すだけでよいようにする。
 */
export function thinkingOptions(modelId: string, budget: number | null): ProviderOptions {
  if (budget == null) return undefined;
  if (providerOf(modelId) === "google") {
    return { google: { thinkingConfig: { thinkingBudget: budget } } };
  }
  // OpenAI は数値ではなく段階指定。0 は「最小」の意味として扱う
  return { openai: { reasoningEffort: budget <= 0 ? "minimal" : "low" } };
}
