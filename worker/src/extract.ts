/**
 * LLM 呼び出しと修復リトライ（仕様書 4.5）
 *
 * Worker（本番）と eval（4.7）の両方がここを通る。eval が別実装になっていると、
 * 「eval で 92% だったモデル」と「本番で動いているモデル」が同じ条件だと言えなくなる。
 *
 * 検証は 2 層（4.5）：
 *   層 1  形    … generateObject が zod スキーマ（4.2）で検証する
 *   層 2  意味  … hardErrors。ここで落ちたら、誤りを文章にして 1 回だけやり直させる
 */
import { generateObject } from "ai";
import { Extraction, type ExtractRequestMeta } from "@syllabus/shared";
import { buildPrompt, buildRepairPrompt } from "./prompt";
import { hardErrors } from "./validate";

type GenerateObjectOptions = Parameters<typeof generateObject>[0];

/**
 * 画像も PDF も file で渡す（AI SDK の指定）。
 * 種類は mediaType（image/jpeg・application/pdf）で伝わるので、型は 1 つでよい。
 */
export type FilePart = {
  readonly type: "file";
  readonly data: Uint8Array;
  readonly mediaType: string;
};

export type Usage = { inputTokens?: number; outputTokens?: number } | undefined;

export type ExtractionRun = {
  /** 2 回試しても意味の検証に通らなければ null（＝ extraction_failed） */
  extraction: Extraction | null;
  retried: boolean;
  usage: Usage;
  /** 最後に残った hard error。ログと eval の分析用 */
  errors: string[];
};

export async function runExtraction(opts: {
  model: GenerateObjectOptions["model"];
  meta: ExtractRequestMeta;
  parts: readonly FilePart[];
  /** モデル固有の設定（思考トークンの上限など。7.3） */
  providerOptions?: GenerateObjectOptions["providerOptions"];
}): Promise<ExtractionRun> {
  const messages = [
    { role: "user", content: [{ type: "text", text: buildPrompt(opts.meta) }, ...opts.parts] },
  ] as unknown as NonNullable<GenerateObjectOptions["messages"]>;

  let retried = false;
  let usage: Usage;
  let errors: string[] = [];

  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await generateObject({
      model: opts.model,
      schema: Extraction,
      messages,
      // 同じ入力で結果が揺れると、モデルの比較もリグレッション検知も成り立たない
      temperature: 0,
      ...(opts.providerOptions ? { providerOptions: opts.providerOptions } : {}),
    });

    usage = r.usage as Usage;
    errors = hardErrors(r.object);
    if (errors.length === 0) {
      return { extraction: r.object, retried, usage, errors: [] };
    }

    if (attempt === 0) {
      retried = true;
      (messages as unknown[]).push(
        { role: "assistant", content: JSON.stringify(r.object) },
        { role: "user", content: buildRepairPrompt(errors) },
      );
    }
  }

  return { extraction: null, retried, usage, errors };
}
