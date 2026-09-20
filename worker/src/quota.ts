/**
 * 無料枠のカウント（仕様書 6.3）
 *
 * カウントの単位は「読み込み回数」ではなく「科目」。端末 ID ＋ 学期 ID をキーに、
 * その学期で抽出済みの科目名のセットを KV に保存する。
 *
 * 既知の制約：端末 ID も pro も、クライアントの自己申告であり偽装できる。
 * 実質の防衛線は LLM 側の予算上限とレート制限（6.3）。
 */
import { FREE_COURSE_LIMIT, normalizeCourseName, type QuotaState } from "@syllabus/shared";

const TTL_SECONDS = 60 * 60 * 24 * 300; // 学期をまたいで残り続けないように

const key = (deviceId: string, semesterId: string) => `quota:${deviceId}:${semesterId}`;

async function readSet(kv: KVNamespace, deviceId: string, semesterId: string): Promise<string[]> {
  const raw = await kv.get(key(deviceId, semesterId), "json");
  return Array.isArray(raw) ? (raw as string[]) : [];
}

export function stateOf(used: number, pro: boolean): QuotaState {
  return {
    limit: pro ? -1 : FREE_COURSE_LIMIT,
    used,
    remaining: pro ? -1 : Math.max(0, FREE_COURSE_LIMIT - used),
    pro,
  };
}

/** 抽出前のチェック。枠を使い切っていれば LLM を呼ばずにペイウォールを返す */
export async function checkQuota(
  kv: KVNamespace,
  deviceId: string,
  semesterId: string,
  pro: boolean,
): Promise<{ allowed: boolean; state: QuotaState }> {
  if (pro) return { allowed: true, state: stateOf(0, true) };
  const used = (await readSet(kv, deviceId, semesterId)).length;
  return { allowed: used < FREE_COURSE_LIMIT, state: stateOf(used, false) };
}

/**
 * 抽出後の加算。まだセットに無い科目名だけを足す。
 * 同じ科目の別書類（シラバスと課題一覧）は枠を消費しない。
 * 1 回のリクエストに枠を超える科目が入っていた場合も、その回は通す（ユーザーに有利な側に倒す）。
 */
export async function addCourses(
  kv: KVNamespace,
  deviceId: string,
  semesterId: string,
  pro: boolean,
  names: string[],
): Promise<QuotaState> {
  if (pro) return stateOf(0, true);

  const current = await readSet(kv, deviceId, semesterId);
  const set = new Set(current);
  for (const n of names) {
    const k = normalizeCourseName(n);
    if (k) set.add(k);
  }
  const next = [...set];
  if (next.length !== current.length) {
    await kv.put(key(deviceId, semesterId), JSON.stringify(next), { expirationTtl: TTL_SECONDS });
  }
  return stateOf(next.length, false);
}

/**
 * 簡易レート制限（6.3）。IP 単位で 1 分あたりの呼び出し回数を制限する。
 * KV は結果整合なので厳密ではないが、暴走を止める目的には足りる。
 */
export async function rateLimited(kv: KVNamespace, ip: string, perMinute = 6): Promise<boolean> {
  const minute = Math.floor(Date.now() / 60000);
  const k = `rl:${ip}:${minute}`;
  const n = Number((await kv.get(k)) ?? 0);
  if (n >= perMinute) return true;
  await kv.put(k, String(n + 1), { expirationTtl: 120 });
  return false;
}
