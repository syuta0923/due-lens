/**
 * 評価ケースの読み込み（仕様書 4.7）
 *
 *   cases/
 *     001.jpg              … 1 ページのケース
 *     001.expected.json    … 手で書いた正解（Extraction 型）
 *     002.p1.jpg           … 複数ページのケースは連番を付ける（ファイル名順に送る）
 *     002.p2.jpg
 *     002.expected.json
 *     002.meta.json        … 任意。学期と「今日」をこのケースだけ上書きする
 *
 * ケース ID は「最初のドットより前」。002.p1.jpg と 002.expected.json が
 * 同じケース 002 にまとまる。
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { Extraction, ISODate, MAX_FILES, type AcceptedMime } from "@syllabus/shared";
import { hardErrors } from "../../worker/src/validate";

const EXT_TO_MIME: Record<string, AcceptedMime> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".pdf": "application/pdf",
};

/** 年が書かれていない日付を補うための前提（4.1）。ケース単位で上書きできる */
export const CaseMeta = z.object({
  today: ISODate,
  semester: z.object({ start: ISODate, end: ISODate }),
});
export type CaseMeta = z.infer<typeof CaseMeta>;

export type CasePage = { file: string; mediaType: AcceptedMime };

export type EvalCase = {
  id: string;
  pages: CasePage[];
  expected: Extraction;
  meta: CaseMeta;
};

/** ケース ID＝最初のドットより前。"002.p1.jpg" も "002.expected.json" も "002" */
function caseIdOf(filename: string): string {
  const i = filename.indexOf(".");
  return i === -1 ? filename : filename.slice(0, i);
}

export async function loadCases(
  dir: string,
  defaults: CaseMeta,
  only?: string[],
): Promise<EvalCase[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    throw new Error(`ケースのディレクトリがありません: ${dir}`);
  }

  // ファイル名順に並べてから振り分ける。複数ページの順序をここで確定させる
  entries.sort();

  const pages = new Map<string, CasePage[]>();
  for (const name of entries) {
    const mediaType = EXT_TO_MIME[path.extname(name).toLowerCase()];
    if (!mediaType) continue; // .expected.json / .meta.json などは対象外
    const id = caseIdOf(name);
    const list = pages.get(id) ?? [];
    list.push({ file: path.join(dir, name), mediaType });
    pages.set(id, list);
  }

  const ids = [...pages.keys()].sort().filter((id) => !only || only.includes(id));
  if (ids.length === 0) {
    throw new Error(
      only
        ? `--cases ${only.join(",")} に一致するケースがありません（${dir}）`
        : `評価ケースが 1 件もありません。${dir} に 001.jpg と 001.expected.json を置いてください`,
    );
  }

  return Promise.all(ids.map((id) => loadCase(dir, id, pages.get(id) ?? [], defaults)));
}

async function loadCase(
  dir: string,
  id: string,
  casePages: CasePage[],
  defaults: CaseMeta,
): Promise<EvalCase> {
  if (casePages.length > MAX_FILES) {
    // 本番が受け付けない構成を評価しても意味がないので、ここで止める（4.1）
    throw new Error(
      `ケース ${id}: ${casePages.length} ページありますが、1 リクエストは ${MAX_FILES} ページまでです`,
    );
  }

  const expectedPath = path.join(dir, `${id}.expected.json`);
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(expectedPath, "utf8"));
  } catch (err) {
    throw new Error(`ケース ${id}: 正解ファイルを読めません（${expectedPath}）: ${String(err)}`);
  }

  const parsed = Extraction.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `ケース ${id}: 正解ファイルがスキーマに合いません（${expectedPath}）\n` +
        parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n"),
    );
  }

  // 正解も手書きである以上まちがえる。本番と同じ意味の検証（4.5）を通しておくと、
  // course_index のずれや存在しない日付を、評価を回す前に見つけられる
  const errors = hardErrors(parsed.data);
  if (errors.length > 0) {
    throw new Error(
      `ケース ${id}: 正解ファイルに矛盾があります（${expectedPath}）\n` +
        errors.map((e) => `  - ${e}`).join("\n"),
    );
  }

  return { id, pages: casePages, expected: parsed.data, meta: await loadMeta(dir, id, defaults) };
}

async function loadMeta(dir: string, id: string, defaults: CaseMeta): Promise<CaseMeta> {
  const metaPath = path.join(dir, `${id}.meta.json`);
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(metaPath, "utf8"));
  } catch {
    return defaults; // 任意のファイルなので、無ければ CLI の既定値を使う
  }

  const parsed = CaseMeta.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `ケース ${id}: ${metaPath} の形式が正しくありません（today / semester.start / semester.end）`,
    );
  }
  return parsed.data;
}
