/**
 * 結果の出力（仕様書 4.7）
 *
 * 画面には「モデル × 長辺」の比較表を出し、同じ内容を JSON で eval/out に残す。
 * JSON を残すのは、プロンプトを変えた前後の差（リグレッション）を後から比べるため。
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { SCORED_FIELDS, addTally, pct, rate, type CaseScore, type Tally } from "./score";

export type CaseResult = {
  caseId: string;
  ok: boolean;
  error: string | null;
  elapsedMs: number;
  /** 送信したページ数。円/頁 の母数 */
  pages: number;
  inputTokens: number | null;
  outputTokens: number | null;
  retried: boolean;
  /** 送信したバイト数（縮小後）。長辺の比較に使う */
  bytes: number;
  score: CaseScore | null;
  /** 本番と同じ要確認判定（4.6）を通した結果の内訳 */
  reasons: Record<string, number>;
};

export type RunResult = {
  model: string;
  longEdge: number;
  cases: CaseResult[];
};

export type Price = { input: number; output: number }; // 100 万トークンあたりの USD

export type Summary = {
  model: string;
  longEdge: number;
  ok: number;
  failed: number;
  fields: Record<string, Tally>;
  courses: Tally;
  missing: number;
  extra: number;
  retried: number;
  medianMs: number;
  avgBytes: number;
  inputTokens: number;
  outputTokens: number;
  jpyPerPage: number | null;
  reasons: Record<string, number>;
};

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  if (s.length % 2 === 1) return s[mid] ?? 0;
  return ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2;
}

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

export function summarize(run: RunResult, price: Price | null, jpyPerUsd: number): Summary {
  const ok = run.cases.filter((c) => c.ok && c.score);
  const zero: Tally = { hit: 0, total: 0 };
  const pages = sum(ok.map((c) => c.pages));

  const fields: Record<string, Tally> = {};
  for (const f of SCORED_FIELDS) {
    fields[f] = ok.reduce((acc, c) => addTally(acc, c.score?.fields[f] ?? zero), { ...zero });
  }

  const inputTokens = sum(ok.map((c) => c.inputTokens ?? 0));
  const outputTokens = sum(ok.map((c) => c.outputTokens ?? 0));

  const reasons: Record<string, number> = {};
  for (const c of ok) for (const [k, n] of Object.entries(c.reasons)) reasons[k] = (reasons[k] ?? 0) + n;

  // 1 ページあたりの円。トークン数が取れていなければ出さない（7.3）
  const jpyPerPage =
    price && pages > 0 && inputTokens + outputTokens > 0
      ? ((inputTokens / 1e6) * price.input + (outputTokens / 1e6) * price.output) *
        (jpyPerUsd / pages)
      : null;

  return {
    model: run.model,
    longEdge: run.longEdge,
    ok: ok.length,
    failed: run.cases.length - ok.length,
    fields,
    courses: ok.reduce(
      (acc, c) => addTally(acc, { hit: c.score?.courses.hit ?? 0, total: c.score?.courses.total ?? 0 }),
      { ...zero },
    ),
    missing: sum(ok.map((c) => c.score?.missing.length ?? 0)),
    extra: sum(ok.map((c) => c.score?.extra.length ?? 0)),
    retried: ok.filter((c) => c.retried).length,
    medianMs: median(ok.map((c) => c.elapsedMs)),
    avgBytes: ok.length === 0 ? 0 : Math.round(sum(ok.map((c) => c.bytes)) / ok.length),
    inputTokens,
    outputTokens,
    jpyPerPage,
    reasons,
  };
}

// --- 画面出力 -------------------------------------------------------------

const pad = (s: string, n: number): string => (s.length >= n ? s : s + " ".repeat(n - s.length));
const padL = (s: string, n: number): string => (s.length >= n ? s : " ".repeat(n - s.length) + s);

/** ケースごとの内訳。どのケースの何が外れたかが分からないと直せない */
export function printCaseDetail(run: RunResult): void {
  console.log(`\n── ${run.model} / 長辺 ${run.longEdge} ─────────────────────`);

  for (const c of run.cases) {
    if (!c.ok || !c.score) {
      console.log(`  ${pad(c.caseId, 6)} 失敗: ${c.error ?? "不明なエラー"}`);
      continue;
    }
    const s = c.score;
    const flags = [
      s.missing.length > 0 ? `取りこぼし${s.missing.length}` : null,
      s.extra.length > 0 ? `余計${s.extra.length}` : null,
      c.retried ? "修復リトライ" : null,
    ].filter(Boolean);

    console.log(
      `  ${pad(c.caseId, 6)} 科目 ${s.courses.hit}/${s.courses.total}` +
        `  予定 ${s.matched.length}/${s.matched.length + s.missing.length}` +
        `  date ${pct(s.fields.date)}  回 ${pct(s.fields.session_number)}  type ${pct(s.fields.type)}` +
        `  ${padL(String(c.elapsedMs), 6)}ms` +
        (flags.length > 0 ? `  [${flags.join(" ")}]` : ""),
    );

    // 外れた値を具体的に出す。ここが無いと「78%」から先に進めない
    for (const m of s.matched) {
      const bad = SCORED_FIELDS.filter((f) => !m.fields[f] && f !== "date_basis");
      if (bad.length === 0) continue;
      const diffs = bad
        .map((f) => {
          if (f === "course") return `course: 別科目に紐付け`;
          const a = JSON.stringify(m.expected[f as "date" | "session_number" | "type"]);
          const b = JSON.stringify(m.predicted[f as "date" | "session_number" | "type"]);
          return `${f}: ${a} → ${b}`;
        })
        .join(" / ");
      console.log(`         ✗ 「${m.expected.title}」 ${diffs}`);
    }
    for (const e of s.missing) console.log(`         − 取りこぼし: 「${e.title}」`);
    for (const e of s.extra) console.log(`         ＋ 余計な追加: 「${e.title}」`);
  }
}

/** モデル × 長辺 の比較表。これを見て 4.7 の用途 1・2 を決める */
export function printComparison(summaries: Summary[]): void {
  console.log("\n=== 比較（フィールド単位の一致率） ===\n");

  const header =
    pad("モデル", 26) +
    padL("長辺", 6) +
    padL("科目名", 8) +
    padL("date", 8) +
    padL("回数", 8) +
    padL("type", 8) +
    padL("取り零", 7) +
    padL("余計", 6) +
    padL("中央ms", 8) +
    padL("KB/頁", 8) +
    padL("円/頁", 8);
  console.log(header);
  console.log("─".repeat(header.length));

  for (const s of summaries) {
    console.log(
      pad(s.model, 26) +
        padL(String(s.longEdge), 6) +
        padL(pct(s.courses), 8) +
        padL(pct(s.fields.date ?? { hit: 0, total: 0 }), 8) +
        padL(pct(s.fields.session_number ?? { hit: 0, total: 0 }), 8) +
        padL(pct(s.fields.type ?? { hit: 0, total: 0 }), 8) +
        padL(String(s.missing), 7) +
        padL(String(s.extra), 6) +
        padL(String(Math.round(s.medianMs)), 8) +
        padL((s.avgBytes / 1024).toFixed(0), 8) +
        padL(s.jpyPerPage == null ? "－" : s.jpyPerPage.toFixed(2), 8) +
        (s.failed > 0 ? `  ※${s.failed}件失敗` : ""),
    );
  }

  // 要確認判定（4.6）が実際に働いているか。4.7 の最後の項目
  console.log("\n=== 要確認の理由の内訳（4.6 が誤りを拾えているかの確認） ===\n");
  for (const s of summaries) {
    const entries = Object.entries(s.reasons).sort((a, b) => b[1] - a[1]);
    const body = entries.length === 0 ? "（なし）" : entries.map(([k, n]) => `${k}=${n}`).join("  ");
    console.log(`  ${pad(`${s.model} / ${s.longEdge}`, 34)} ${body}`);
  }
}

export async function writeReport(
  outDir: string,
  payload: { startedAt: string; summaries: Summary[]; runs: RunResult[] },
): Promise<string> {
  await mkdir(outDir, { recursive: true });
  const name = `${payload.startedAt.replace(/[:.]/g, "-")}.json`;
  const file = path.join(outDir, name);
  await writeFile(file, JSON.stringify(payload, null, 2), "utf8");
  return file;
}

export { rate };
