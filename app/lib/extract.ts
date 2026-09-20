/**
 * 中継 API の呼び出し（仕様書 7.1・4.1）
 *
 * 画像は送る前に長辺を縮小する（費用と速度のため。サイズは 4.7 の eval で確定させる）。
 */
import Constants from "expo-constants";
import * as ImageManipulator from "expo-image-manipulator";
import {
  IMAGE_LONG_EDGE,
  MAX_FILES,
  type ExtractError,
  type ExtractRequestMeta,
  type ExtractResponse,
  type ExtractSuccess,
} from "@syllabus/shared";

const API_BASE = (Constants.expoConfig?.extra?.apiBaseUrl as string) ?? "http://localhost:8787";

export type Attachment = {
  uri: string;
  mimeType: "image/jpeg" | "image/png" | "application/pdf";
  name: string;
};

/** 画像の長辺を縮小して JPEG にする。PDF はそのまま */
export async function shrink(a: Attachment, longEdge = IMAGE_LONG_EDGE): Promise<Attachment> {
  if (a.mimeType === "application/pdf") return a;

  const ctx = ImageManipulator.ImageManipulator.manipulate(a.uri);
  ctx.resize({ width: longEdge });
  const image = await ctx.renderAsync();
  const out = await image.saveAsync({
    compress: 0.8,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return { uri: out.uri, mimeType: "image/jpeg", name: a.name.replace(/\.\w+$/, "") + ".jpg" };
}

export async function extract(
  attachments: Attachment[],
  meta: ExtractRequestMeta,
): Promise<ExtractResponse> {
  if (attachments.length > MAX_FILES) {
    return {
      ok: false,
      code: "too_many_files",
      message: `一度に送れるのは ${MAX_FILES} ページまでです`,
    } satisfies ExtractError;
  }

  const form = new FormData();
  form.append("meta", JSON.stringify(meta));
  for (const a of await Promise.all(attachments.map((x) => shrink(x)))) {
    // React Native の FormData はこの形のオブジェクトをファイルとして扱う
    form.append("files", { uri: a.uri, type: a.mimeType, name: a.name } as unknown as Blob);
  }

  try {
    const res = await fetch(`${API_BASE}/extract`, { method: "POST", body: form });
    return (await res.json()) as ExtractResponse;
  } catch {
    return {
      ok: false,
      code: "internal",
      message: "通信に失敗しました。電波の良い場所で試してください",
    } satisfies ExtractError;
  }
}

export const isSuccess = (r: ExtractResponse): r is ExtractSuccess => r.ok;
