/**
 * 中継 API（仕様書 7.1）
 *
 *   POST /extract  multipart/form-data
 *     meta  : ExtractRequestMeta の JSON 文字列
 *     files : 画像 / PDF（最大 5）
 *
 * API キーをアプリに含めないための中継。画像・PDF は保存しない（7.5）。
 */
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import {
  ACCEPTED_MIME,
  ExtractRequestMeta,
  HTTP_STATUS,
  MAX_FILES,
  MAX_TOTAL_BYTES,
  buildDrafts,
  countReasons,
  type AcceptedMime,
  type ExtractError,
  type ExtractErrorCode,
  type ExtractSuccess,
  type QuotaState,
} from "@syllabus/shared";
import { runExtraction, type FilePart } from "./extract";
import { addCourses, checkQuota, rateLimited } from "./quota";

export type Env = {
  QUOTA: KVNamespace;
  MODEL: string;
  GOOGLE_GENERATIVE_AI_API_KEY: string;
  RATE_LIMIT_PER_MINUTE?: string;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

const fail = (code: ExtractErrorCode, message: string, quota?: QuotaState) =>
  json(
    { ok: false, code, message, ...(quota ? { quota } : {}) } satisfies ExtractError,
    HTTP_STATUS[code],
  );

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, model: env.MODEL });
    }
    if (req.method !== "POST" || url.pathname !== "/extract") {
      return fail("bad_request", "対応していないエンドポイントです");
    }

    try {
      return await handleExtract(req, env);
    } catch (err) {
      console.log(JSON.stringify({ at: "unhandled", error: String(err) }));
      return fail("internal", "サーバー側でエラーが起きました。時間をおいて試してください");
    }
  },
};

async function handleExtract(req: Request, env: Env): Promise<Response> {
  const started = Date.now();

  const ip = req.headers.get("cf-connecting-ip") ?? "unknown";
  if (await rateLimited(env.QUOTA, ip, Number(env.RATE_LIMIT_PER_MINUTE ?? 6))) {
    return fail("rate_limited", "短時間に読み込みすぎです。少し待ってから試してください");
  }

  // --- 入力の取り出しと検証 ---
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("bad_request", "リクエストの形式が正しくありません");
  }

  const parsed = ExtractRequestMeta.safeParse(safeJson(form.get("meta")));
  if (!parsed.success) return fail("bad_request", "リクエストの形式が正しくありません");
  const meta = parsed.data;

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) return fail("bad_request", "書類が添付されていません");
  if (files.length > MAX_FILES) {
    return fail("too_many_files", `一度に送れるのは ${MAX_FILES} ページまでです。選び直してください`);
  }
  const total = files.reduce((n, f) => n + f.size, 0);
  if (total > MAX_TOTAL_BYTES) {
    return fail("payload_too_large", "画像が大きすぎます。枚数を減らして試してください");
  }
  for (const f of files) {
    if (!ACCEPTED_MIME.includes(f.type as AcceptedMime)) {
      return fail("unsupported_media", `対応していない形式です（${f.type || "不明"}）`);
    }
  }

  // --- 抽出前の無料枠チェック（超えていれば LLM を呼ばない＝費用が発生しない） ---
  const pre = await checkQuota(env.QUOTA, meta.deviceId, meta.semesterId, meta.pro);
  if (!pre.allowed) {
    return fail("paywall_required", "無料で読み込めるのは 1 学期 3 科目までです", pre.state);
  }

  // --- LLM 呼び出し（zod スキーマ 1 本から構造化出力・検証・型を導出） ---
  const google = createGoogleGenerativeAI({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY });
  const model = google(env.MODEL);

  const parts: FilePart[] = await Promise.all(
    files.map(async (f) => {
      const data = new Uint8Array(await f.arrayBuffer());
      return f.type === "application/pdf"
        ? ({ type: "file", data, mediaType: f.type } as const)
        : ({ type: "image", image: data, mediaType: f.type } as const);
    }),
  );

  // 呼び出しと修復リトライ（4.5）は extract.ts に置き、eval（4.7）と共有する
  const { extraction: result, retried, usage, errors } = await runExtraction({ model, meta, parts });

  if (!result) {
    console.log(JSON.stringify({ at: "hard_error", model: env.MODEL, errors }));
    return fail(
      "extraction_failed",
      "書類をうまく読み取れませんでした。手で入力するか、撮り直してください",
    );
  }

  // --- 抽出後に科目を加算 ---
  const quota = await addCourses(
    env.QUOTA,
    meta.deviceId,
    meta.semesterId,
    meta.pro,
    result.courses.map((c) => c.name),
  );

  // --- ログ（7.5）。画像・PDF と source_text は記録しない ---
  const drafts = buildDrafts(result, {
    id: meta.semesterId,
    name: "",
    start: meta.semester.start,
    end: meta.semester.end,
    noClassDates: [],
    classHolidays: [],
    makeupDays: [],
  });
  console.log(
    JSON.stringify({
      at: "extract",
      model: env.MODEL,
      elapsedMs: Date.now() - started,
      pages: files.length,
      bytes: total,
      retried,
      inputTokens: usage?.inputTokens ?? null,
      outputTokens: usage?.outputTokens ?? null,
      courses: result.courses.length,
      events: result.events.length,
      reasons: countReasons(drafts),
    }),
  );

  return json({
    ok: true,
    extraction: result,
    quota,
    meta: {
      model: env.MODEL,
      elapsedMs: Date.now() - started,
      retried,
      inputTokens: usage?.inputTokens ?? null,
      outputTokens: usage?.outputTokens ?? null,
    },
  } satisfies ExtractSuccess);
}

function safeJson(v: File | string | null): unknown {
  if (typeof v !== "string") return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}
