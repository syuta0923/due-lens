/**
 * 締切の通知（F7）
 *
 * 課題・試験の締切の前日と当日に、端末のローカル通知を予約する。
 * タイミングは今は固定（前日 20:00・当日 8:00）。設定で変えられるようにするのは後で（S7）。
 *
 * カレンダーと同じく eventKey で予約 ID を覚えておき、同じ予定を登録し直したら
 * 古い予約を消してから入れ直す（二重に鳴らさない）。
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { DraftEvent } from "@syllabus/shared";
import { eventKey, previousKey, toLocalDate, type Draft } from "./calendar";

const CHANNEL_ID = "deadlines";
const NOTIFY_MAP_KEY = "notify:ids";

/** 前日の何時・当日の何時に鳴らすか */
export const REMIND_DAY_BEFORE = "20:00";
export const REMIND_SAME_DAY = "08:00";

/** 通知に要る項目だけ。確認画面の下書き（DraftEvent）と締切一覧（Deadline）のどちらも渡せる */
type Remindable = Pick<DraftEvent, "course" | "title" | "type" | "date" | "time"> &
  Pick<Draft, "originKey">;

type NotifyMap = Record<string, string[]>; // eventKey → 予約した通知の ID

async function loadMap(): Promise<NotifyMap> {
  const raw = await AsyncStorage.getItem(NOTIFY_MAP_KEY);
  return raw ? (JSON.parse(raw) as NotifyMap) : {};
}

async function saveMap(map: NotifyMap): Promise<void> {
  await AsyncStorage.setItem(NOTIFY_MAP_KEY, JSON.stringify(map));
}

/** アプリを開いている間に届いた通知も出す。起動時に 1 回呼ぶ */
export function setupNotifications(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * 通知の権限をもらう。Android 8 以上はチャンネルが要るので先に作る
 * （Android 13 以上では、チャンネルを作らないと権限ダイアログも出ない）。
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "締切のお知らせ",
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const res = await Notifications.requestPermissionsAsync();
  return res.granted;
}

function isDeadline(e: Remindable): boolean {
  return e.type === "assignment" || e.type === "exam";
}

/** "YYYY-MM-DD" の前日 */
function dayBefore(date: string): string {
  const d = toLocalDate(date, null);
  d.setDate(d.getDate() - 1);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

type Reminder = { at: Date; title: string; body: string };

/** 1 件の締切に対して鳴らす通知。過去の時刻と、締切より後の時刻は外す */
export function remindersFor(e: Remindable, now: Date = new Date()): Reminder[] {
  if (!isDeadline(e) || !e.date) return [];

  // 時刻の無い試験は終日扱いなので、その日の終わりを締切とみなす
  const deadline = toLocalDate(e.date, e.time ?? "23:59");
  const label = e.type === "exam" ? "試験" : "締切";
  const when = e.time ? ` ${e.time}` : "";
  const title = `${e.title}（${e.course}）`;

  const candidates: Reminder[] = [
    {
      at: toLocalDate(dayBefore(e.date), REMIND_DAY_BEFORE),
      title: `明日${when}${label}`,
      body: title,
    },
    {
      at: toLocalDate(e.date, REMIND_SAME_DAY),
      title: `今日${when}${label}`,
      body: title,
    },
  ];
  return candidates.filter((r) => r.at > now && r.at < deadline);
}

export type ScheduleResult = { scheduled: number };

/** 登録した予定のうち、課題・試験の通知を予約する（入れ直し）。権限は呼ぶ側で確かめる */
export async function scheduleReminders(events: Remindable[]): Promise<ScheduleResult> {
  const map = await loadMap();
  let scheduled = 0;

  for (const e of events) {
    // 日付の無い予定はカレンダーにも登録しない（calendar.ts）。前の予約もそのままにする
    if (!e.date) continue;
    const key = eventKey(e);

    // 古い予約を消す。日付などを直した予定は直す前のキー（previousKey）の分も消す
    // 種別を「その他」に直した予定も、前に予約した分はここで止める
    const prev = previousKey(e);
    for (const k of prev ? [key, prev] : [key]) {
      for (const id of map[k] ?? []) {
        await Notifications.cancelScheduledNotificationAsync(id);
      }
      delete map[k];
    }
    if (!isDeadline(e)) continue;

    const ids: string[] = [];
    for (const r of remindersFor(e)) {
      const id = await Notifications.scheduleNotificationAsync({
        content: { title: r.title, body: r.body },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: r.at,
          channelId: CHANNEL_ID,
        },
      });
      ids.push(id);
    }
    if (ids.length > 0) map[key] = ids;
    else delete map[key];
    scheduled += ids.length;
  }

  await saveMap(map);
  return { scheduled };
}

/** 課題を完了にしたとき、その締切の通知だけを取り消す（F9） */
export async function cancelReminders(key: string): Promise<void> {
  const map = await loadMap();
  for (const id of map[key] ?? []) {
    await Notifications.cancelScheduledNotificationAsync(id);
  }
  delete map[key];
  await saveMap(map);
}

/** 予約した通知をすべて取り消す（専用カレンダーを消すときに一緒に呼ぶ） */
export async function cancelAllReminders(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  await AsyncStorage.removeItem(NOTIFY_MAP_KEY);
}

/** 開発用：10 秒後に 1 件鳴らして、通知が届くかだけを確かめる */
export async function sendTestReminder(): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: { title: "明日 23:59 締切", body: "レポート課題（テスト）" },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 10,
      channelId: CHANNEL_ID,
    },
  });
}
