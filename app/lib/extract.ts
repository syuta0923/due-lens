/**
 * 中継 API の呼び出し（仕様書 7.1・4.1）
 *
 * 画像は送る前に長辺を縮小する（費用と速度のため。サイズは 4.7 の eval で確定させる）。
 */
import Constants from "expo-constants";
import { File } from "expo-file-system";
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
  const image = await ctx.renderAsync();

  // 縮小するのは「長辺」であって幅ではない。width だけを指定すると、縦長の写真
  // （シラバスを撮ると普通こうなる）で高さが longEdge を超え、eval で決めた
  // サイズより大きい画像を送ってしまう。短い方の辺を指定しないと縦横比は保たれる
  const longer = Math.max(image.width, image.height);
  if (longer > longEdge) {
    if (image.width >= image.height) ctx.resize({ width: longEdge });
    else ctx.resize({ height: longEdge });
  }

  const resized = await ctx.renderAsync();
  const out = await resized.saveAsync({
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
    // Expo の fetch（expo/fetch）は React Native 流の { uri, type, name } を受け付けず
    // "Unsupported FormDataPart implementation" で落ちる。Blob として振る舞う
    // expo-file-system の File を渡す（content-type は拡張子から決まる）
    form.append("files", new File(a.uri), a.name);
  }

  try {
    const res = await fetch(`${API_BASE}/extract`, { method: "POST", body: form });
    return (await res.json()) as ExtractResponse;
  } catch (e) {
    // 利用者には一律の文言を出すが、原因（接続先・JSON 以外の応答など）はログに残す
    console.warn("[extract] 通信に失敗", API_BASE, e);
    return {
      ok: false,
      code: "internal",
      message:
        "通信に失敗しました。電波の良い場所で試してください" +
        (__DEV__ ? `\n\n[開発用] ${API_BASE}\n${String(e)}` : ""),
    } satisfies ExtractError;
  }
}

export const isSuccess = (r: ExtractResponse): r is ExtractSuccess => r.ok;
