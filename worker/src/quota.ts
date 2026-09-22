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

/**
 * pro を名乗る端末にも置く絶対上限（6.3 の「既知の制約」への緩和策）。
 *
 * `pro` はクライアントの自己申告なので、true を送るだけで無制限に LLM を呼べてしまう。
 * サーバー側の購入検証を入れるまでの間、ここで「無制限」を「上限つき」に変えておく。
 *
 * 200 科目は人間の 1 学期では到達し得ない値で、正規の有料ユーザーには当たらない。
 * 上限そのものより、pro の利用も KV に記録されるようになること（＝異常を検知できること）
 * の方が効果が大きい。
 */
export const PRO_HARD_LIMIT = 200;

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

/**
 * 抽出前のチェック。枠を使い切っていれば LLM を呼ばずにペイウォールを返す。
 * pro も素通しにはせず、PRO_HARD_LIMIT で頭打ちにする。
 */
export async function checkQuota(
  kv: KVNamespace,
  deviceId: string,
  semesterId: string,
  pro: boolean,
): Promise<{ allowed: boolean; state: QuotaState }> {
  const used = (await readSet(kv, deviceId, semesterId)).length;
  return {
    allowed: used < (pro ? PRO_HARD_LIMIT : FREE_COURSE_LIMIT),
    state: stateOf(used, pro),
  };
}

/**
 * 抽出後の加算。まだセットに無い科目名だけを足す。
 * 同じ科目の別書類（シラバスと課題一覧）は枠を消費しない。
 * 1 回のリクエストに枠を超える科目が入っていた場合も、その回は通す（ユーザーに有利な側に倒す）。
 *
 * pro でも加算する。無料枠の判定には使わないが、記録が残らないと
 * pro を騙る大量呼び出しに気づけないため（PRO_HARD_LIMIT の項）。
 */
export async function addCourses(
  kv: KVNamespace,
  deviceId: string,
  semesterId: string,
  pro: boolean,
  names: string[],
): Promise<QuotaState> {
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
  return stateOf(next.length, pro);
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
