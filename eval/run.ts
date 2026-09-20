/**
 * 抽出精度の評価（仕様書 4.7）
 *
 * 用途は 3 つ：①モデルの選定 ②画像の縮小サイズの決定 ③リグレッション検知。
 *
 *   npm run eval -w eval -- --dry-run
 *   npm run eval -w eval -- --model gemini-2.5-flash-lite --long-edge 1568
 *   npm run eval -w eval -- --model gemini-2.5-flash-lite,gemini-3.6-flash --long-edge 1024,1568,2048
 *
 * Worker を経由せず LLM を直接呼ぶ。KV も課金も挟まずモデル × 長辺を総当たりできるため。
 * ただしプロンプト・スキーマ・検証・修復リトライは worker/src を import して共有しており、
 * 本番と同じ経路を測っている（worker/src/extract.ts）。
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { buildDrafts, countReasons, type Semester } from "@syllabus/shared";
import { runExtraction, type FilePart } from "../worker/src/extract";
import { loadCases, type CaseMeta, type EvalCase } from "./lib/cases";
import { preparePages, type PreparedPage } from "./lib/prepare";
import {
  printCaseDetail,
  printComparison,
  summarize,
  writeReport,
  type CaseResult,
  type Price,
  type RunResult,
} from "./lib/report";
import { scoreCase } from "./lib/score";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

/**
 * 100 万トークンあたりの USD。仕様書 7.3 の暫定値。
 * **モデルを決めるときは必ず公式の料金ページで確認し直すこと。**
 * --in-price / --out-price で上書きできる。
 */
const PRICES: Record<string, Price> = {
  "gemini-2.5-flash-lite": { input: 0.1, output: 0.4 },
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "gemini-3.5-flash": { input: 1.5, output: 9.0 },
  "gemini-3.6-flash": { input: 0.75, output: 3.75 },
};

// --- 引数 -----------------------------------------------------------------

type Args = {
  models: string[];
  longEdges: number[];
  cases: string[] | undefined;
  casesDir: string;
  outDir: string;
  concurrency: number;
  dryRun: boolean;
  meta: CaseMeta;
  price: Price | null;
  jpy: number;
  thinking: number | null;
};

function parseArgs(argv: string[]): Args {
  const flags = new Map<string, string>();
  const bare = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a?.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      flags.set(key, next);
      i++;
    } else {
      bare.add(key);
    }
  }

  const get = (k: string, d: string): string => flags.get(k) ?? d;
  const list = (k: string, d: string): string[] =>
    get(k, d)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

  const inPrice = flags.get("in-price");
  const outPrice = flags.get("out-price");

  return {
    models: list("model", "gemini-2.5-flash-lite"),
    longEdges: list("long-edge", "1568").map(Number).filter((n) => Number.isFinite(n) && n > 0),
    cases: flags.has("cases") ? list("cases", "") : undefined,
    casesDir: path.resolve(ROOT, get("cases-dir", "eval/cases")),
    outDir: path.resolve(ROOT, get("out", "eval/out")),
    concurrency: Math.max(1, Number(get("concurrency", "2"))),
    dryRun: bare.has("dry-run"),
    meta: {
      // 「年が書かれていない日付」を補う前提（4.1）。ケースごとに 00X.meta.json で上書きできる
      today: get("today", new Date().toISOString().slice(0, 10)),
      semester: {
        start: get("semester-start", "2026-09-28"),
        end: get("semester-end", "2027-01-29"),
      },
    },
    price:
      inPrice && outPrice ? { input: Number(inPrice), output: Number(outPrice) } : null,
    jpy: Number(get("jpy", "150")),
    thinking: flags.has("thinking") ? Number(get("thinking", "0")) : null,
  };
}

/** worker/.dev.vars に置いた API キーを読む。eval のためだけに 2 か所へ書かせない */
async function loadApiKey(): Promise<string> {
  const fromEnv = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (fromEnv) return fromEnv;

  try {
    const text = await readFile(path.join(ROOT, "worker/.dev.vars"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*GOOGLE_GENERATIVE_AI_API_KEY\s*=\s*(.+?)\s*$/.exec(line);
      if (m?.[1]) return m[1].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* 無ければ下のエラーへ */
  }

  throw new Error(
    "API キーがありません。worker/.dev.vars に GOOGLE_GENERATIVE_AI_API_KEY を書くか、\n" +
      "環境変数に設定してください（--dry-run なら不要です）。",
  );
}

// --- 実行 -----------------------------------------------------------------

/** 同時実行数を抑える。無料枠のレート制限に当たると結果が歪むため */
async function pool<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      const item = items[i];
      if (i >= items.length || item === undefined) return;
      out[i] = await fn(item);
    }
  });
  await Promise.all(workers);
  return out;
}

const toParts = (pages: PreparedPage[]): FilePart[] =>
  pages.map((p) =>
    p.mediaType === "application/pdf"
      ? ({ type: "file", data: p.data, mediaType: p.mediaType } as const)
      : ({ type: "image", image: p.data, mediaType: p.mediaType } as const),
  );

/** 学期の設定。eval では休講日・振替日を入れない（書類だけから決まる精度を測るため） */
const semesterOf = (meta: CaseMeta): Semester => ({
  id: "eval",
  name: "eval",
  start: meta.semester.start,
  end: meta.semester.end,
  noClassDates: [],
  classHolidays: [],
  makeupDays: [],
});

async function runCase(
  c: EvalCase,
  pages: PreparedPage[],
  model: ReturnType<ReturnType<typeof createGoogleGenerativeAI>>,
  thinking: number | null,
): Promise<CaseResult> {
  const started = Date.now();
  const bytes = pages.reduce((n, p) => n + p.bytes, 0);
  const base = {
    caseId: c.id,
    pages: pages.length,
    bytes,
    inputTokens: null,
    outputTokens: null,
    retried: false,
    score: null,
    reasons: {},
  };

  try {
    const { extraction, retried, usage, errors } = await runExtraction({
      model,
      meta: { deviceId: "eval", semesterId: "eval", pro: true, ...c.meta },
      parts: toParts(pages),
      ...(thinking == null
        ? {}
        : { providerOptions: { google: { thinkingConfig: { thinkingBudget: thinking } } } }),
    });

    const elapsedMs = Date.now() - started;
    if (!extraction) {
      return {
        ...base,
        ok: false,
        error: `検証に通りませんでした: ${errors.join(" / ")}`,
        elapsedMs,
        retried,
        inputTokens: usage?.inputTokens ?? null,
        outputTokens: usage?.outputTokens ?? null,
      };
    }

    // 本番と同じ要確認判定（4.6）を通し、曜日クロスチェックが働いているかを見る（4.7）
    const reasons = countReasons(buildDrafts(extraction, semesterOf(c.meta)));

    return {
      ...base,
      ok: true,
      error: null,
      elapsedMs,
      retried,
      inputTokens: usage?.inputTokens ?? null,
      outputTokens: usage?.outputTokens ?? null,
      score: scoreCase(c.expected, extraction),
      reasons,
    };
  } catch (err) {
    return {
      ...base,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      elapsedMs: Date.now() - started,
    };
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const cases = await loadCases(args.casesDir, args.meta, args.cases);

  console.log(
    `ケース ${cases.length} 件（${cases.reduce((n, c) => n + c.pages.length, 0)} ページ）` +
      `／モデル ${args.models.length} × 長辺 ${args.longEdges.length}`,
  );

  // 長辺ごとに 1 回だけ縮小し、モデル間で使い回す
  const prepared = new Map<number, Map<string, PreparedPage[]>>();
  for (const longEdge of args.longEdges) {
    const byCase = new Map<string, PreparedPage[]>();
    for (const c of cases) byCase.set(c.id, await preparePages(c.pages, longEdge));
    prepared.set(longEdge, byCase);
  }

  if (args.dryRun) {
    console.log("\n--dry-run：LLM は呼びません。縮小後のサイズだけ出します\n");
    for (const longEdge of args.longEdges) {
      const byCase = prepared.get(longEdge);
      const total = cases.reduce(
        (n, c) => n + (byCase?.get(c.id) ?? []).reduce((m, p) => m + p.bytes, 0),
        0,
      );
      console.log(`  長辺 ${String(longEdge).padStart(5)}  合計 ${(total / 1024).toFixed(0)} KB`);
      for (const c of cases) {
        const kb = (byCase?.get(c.id) ?? []).map((p) => `${(p.bytes / 1024).toFixed(0)}KB`);
        console.log(
          `    ${c.id}  ${c.pages.length}頁 [${kb.join(" ")}]` +
            `  正解: 科目${c.expected.courses.length} 予定${c.expected.events.length}`,
        );
      }
    }
    console.log("\n正解ファイルはすべてスキーマと意味の検証（4.5）を通りました。");
    return;
  }

  const google = createGoogleGenerativeAI({ apiKey: await loadApiKey() });
  const startedAt = new Date().toISOString();
  const runs: RunResult[] = [];

  for (const modelId of args.models) {
    for (const longEdge of args.longEdges) {
      const byCase = prepared.get(longEdge);
      const model = google(modelId);
      const results = await pool(cases, args.concurrency, (c) =>
        runCase(c, byCase?.get(c.id) ?? [], model, args.thinking),
      );
      const run: RunResult = { model: modelId, longEdge, cases: results };
      runs.push(run);
      printCaseDetail(run);
    }
  }

  const summaries = runs.map((r) =>
    summarize(r, args.price ?? PRICES[r.model] ?? null, args.jpy),
  );
  printComparison(summaries);

  const unpriced = summaries.filter((s) => s.jpyPerPage == null).map((s) => s.model);
  if (unpriced.length > 0) {
    console.log(
      `\n※ 料金が未登録のモデル: ${[...new Set(unpriced)].join(", ")}` +
        `（--in-price / --out-price で指定できます）`,
    );
  }
  console.log("※ 円/頁 は仕様書 7.3 の暫定価格です。モデル決定時に公式の料金ページで再確認してください。");

  const file = await writeReport(args.outDir, { startedAt, summaries, runs });
  console.log(`\n結果を保存しました: ${path.relative(ROOT, file)}`);
}

main().catch((err) => {
  console.error(`\n${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
