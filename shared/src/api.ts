/**
 * アプリ ⇔ 中継 API の契約（仕様書 7.1）
 *
 * 仕様書には LLM の出力スキーマ（4.2）しかなかったため、その手前の HTTP 契約をここで定める。
 * アプリと Worker の両方がこのファイルの型を使う。
 *
 * POST /extract
 *   Content-Type: multipart/form-data
 *     meta : ExtractRequestMeta を JSON.stringify した文字列（1 個）
 *     files: image/jpeg | image/png | application/pdf（最大 MAX_FILES 個）
 *   200 → ExtractSuccess / それ以外 → ExtractError
 */
import { z } from "zod";
import { Extraction, ISODate } from "./schema";

/** MVP は最大 5 ページを 1 リクエストにまとめて送る（4.1） */
export const MAX_FILES = 5;
/** 合計バイト数の上限（6.3 の防衛線の 1 つ） */
export const MAX_TOTAL_BYTES = 12 * 1024 * 1024;
/** 1 学期あたりの無料科目数（6.2） */
export const FREE_COURSE_LIMIT = 3;
/** 送信前に縮小する画像の長辺。暫定値。4.7 の eval（1024 / 1568 / 2048）で確定させる */
export const IMAGE_LONG_EDGE = 1568;

export const ACCEPTED_MIME = ["image/jpeg", "image/png", "application/pdf"] as const;
export type AcceptedMime = (typeof ACCEPTED_MIME)[number];

export const ExtractRequestMeta = z.object({
  /** 端末 ID。expo-application の getAndroidId()。自己申告であり偽装可能（6.3） */
  deviceId: z.string().min(1).max(128),
  semesterId: z.string().min(1).max(64),
  /** RevenueCat の entitlement "pro" の有無。これもクライアントの自己申告（6.3） */
  pro: z.boolean(),
  /** 端末のローカル日付。年が書かれていない日付の補完に使う（4.1） */
  today: ISODate,
  semester: z.object({ start: ISODate, end: ISODate }),
});
export type ExtractRequestMeta = z.infer<typeof ExtractRequestMeta>;

export type QuotaState = {
  limit: number;      // 無料枠の上限（pro なら Infinity ではなく -1 で表す）
  used: number;       // その学期で抽出済みの科目数
  remaining: number;  // 残り科目数。pro なら -1
  pro: boolean;
};

export type ExtractSuccess = {
  ok: true;
  extraction: Extraction;
  quota: QuotaState;
  /** ログと eval 用（7.5）。画像・source_text は含めない */
  meta: {
    model: string;
    elapsedMs: number;
    retried: boolean;
    inputTokens: number | null;
    outputTokens: number | null;
  };
};

export const EXTRACT_ERROR_CODES = [
  "bad_request",          // 400
  "unsupported_media",    // 415
  "too_many_files",       // 413
  "payload_too_large",    // 413
  "paywall_required",     // 402 無料枠を使い切った（LLM は呼んでいない）
  "rate_limited",         // 429
  "extraction_failed",    // 422 修復リトライ後も検証に通らなかった → 手入力画面へ
  "internal",             // 500
] as const;
export type ExtractErrorCode = (typeof EXTRACT_ERROR_CODES)[number];

export type ExtractError = {
  ok: false;
  code: ExtractErrorCode;
  message: string;        // 画面にそのまま出せる日本語
  quota?: QuotaState;     // paywall_required のときは必ず入れる
};

export type ExtractResponse = ExtractSuccess | ExtractError;

export const HTTP_STATUS: Record<ExtractErrorCode, number> = {
  bad_request: 400,
  unsupported_media: 415,
  too_many_files: 413,
  payload_too_large: 413,
  paywall_required: 402,
  rate_limited: 429,
  extraction_failed: 422,
  internal: 500,
};
