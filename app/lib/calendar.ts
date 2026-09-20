/**
 * 端末カレンダーへの登録と重複防止（仕様書 7.6）
 *
 * 専用カレンダー「シラバス」を作って書き込む。既存カレンダーに直接書くと、
 * ユーザーが「やっぱり全部消したい」と思ったときに 1 件ずつ消すしかなくなるため。
 *
 * 登録済みイベントの ID は AsyncStorage に保存し、同じキーの予定は新規作成ではなく更新する（F11）。
 *
 * expo-calendar は SDK 57 でオブジェクト指向 API に変わっている
 * （createCalendar → ExpoCalendar、cal.createEvent → ExpoCalendarEvent）。
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Calendar from "expo-calendar";
import { parseDate, type DraftEvent } from "@syllabus/shared";

export const CALENDAR_TITLE = "シラバス";
const CALENDAR_ID_KEY = "calendar:id";
const EVENT_MAP_KEY = "calendar:events";

/** courseId ＋ title ＋ date から安定したキーを作る（7.6） */
export function eventKey(e: Pick<DraftEvent, "course" | "title" | "date">): string {
  return `${e.course}|${e.title}|${e.date ?? "-"}`;
}

type EventMap = Record<string, string>; // key → 端末カレンダーのイベント ID

async function loadMap(): Promise<EventMap> {
  const raw = await AsyncStorage.getItem(EVENT_MAP_KEY);
  return raw ? (JSON.parse(raw) as EventMap) : {};
}

async function saveMap(map: EventMap): Promise<void> {
  await AsyncStorage.setItem(EVENT_MAP_KEY, JSON.stringify(map));
}

export async function ensurePermission(): Promise<boolean> {
  const res = await Calendar.requestCalendarPermissions();
  return res.granted;
}

/** 専用カレンダーを取得（無ければ作る） */
export async function ensureCalendar(): Promise<Calendar.ExpoCalendar> {
  const saved = await AsyncStorage.getItem(CALENDAR_ID_KEY);
  const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);

  const existing = calendars.find((c) => c.id === saved) ?? calendars.find((c) => c.title === CALENDAR_TITLE);
  if (existing) {
    await AsyncStorage.setItem(CALENDAR_ID_KEY, existing.id);
    return existing;
  }

  const created = await Calendar.createCalendar({
    title: CALENDAR_TITLE,
    name: CALENDAR_TITLE,
    color: "#2F6FED",
    accessLevel: Calendar.CalendarAccessLevel.OWNER,
    ownerAccount: "local",
    source: { isLocalAccount: true, name: CALENDAR_TITLE, type: Calendar.SourceType.LOCAL },
  });
  await AsyncStorage.setItem(CALENDAR_ID_KEY, created.id);
  return created;
}

/**
 * 日付（"YYYY-MM-DD"）＋時刻（"HH:MM"）を端末の日時にする。
 * Date を作るのはここだけ。schedule.ts の内部では文字列のままにしておく（4.3）。
 */
export function toLocalDate(date: string, time: string | null): Date {
  const { y, m, d } = parseDate(date);
  const [hh, mm] = (time ?? "00:00").split(":").map(Number) as [number, number];
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

export type RegisterPlan = { creates: DraftEvent[]; updates: DraftEvent[]; skipped: DraftEvent[] };

/** 確認画面のボタンに「新規 12 件・更新 3 件」と出すための下見（7.6） */
export async function planRegistration(events: DraftEvent[]): Promise<RegisterPlan> {
  const map = await loadMap();
  const plan: RegisterPlan = { creates: [], updates: [], skipped: [] };
  for (const e of events) {
    if (!e.date) plan.skipped.push(e);
    else if (map[eventKey(e)]) plan.updates.push(e);
    else plan.creates.push(e);
  }
  return plan;
}

export type RegisterResult = { created: number; updated: number; skipped: number };

export async function register(events: DraftEvent[]): Promise<RegisterResult> {
  const cal = await ensureCalendar();
  const map = await loadMap();
  const result: RegisterResult = { created: 0, updated: 0, skipped: 0 };

  for (const e of events) {
    if (!e.date) {
      result.skipped++;
      continue;
    }

    const isDeadline = e.type === "assignment" || e.type === "exam";
    const startDate = toLocalDate(e.date, e.time);
    const endDate = new Date(startDate.getTime() + (isDeadline ? 30 : 90) * 60 * 1000);
    const details = {
      title: `${e.title}（${e.course}）`,
      startDate,
      endDate,
      notes: e.sourceText,
      allDay: e.time === null && !isDeadline,
    };

    const key = eventKey(e);
    const existingId = map[key];

    if (existingId) {
      try {
        const ev = new Calendar.ExpoCalendarEvent(existingId);
        await ev.update(details);
        result.updated++;
        continue;
      } catch {
        // 端末側で消されていた場合は作り直す
        delete map[key];
      }
    }

    const created = await cal.createEvent(details);
    map[key] = created.id;
    result.created++;
  }

  await saveMap(map);
  return result;
}

/** デモの撮り直し用。専用カレンダーごと消せば登録した予定はすべて消える */
export async function removeAll(): Promise<void> {
  const saved = await AsyncStorage.getItem(CALENDAR_ID_KEY);
  if (saved) {
    try {
      await new Calendar.ExpoCalendar(saved).delete();
    } catch {
      // すでに消えている
    }
  }
  await AsyncStorage.multiRemove([CALENDAR_ID_KEY, EVENT_MAP_KEY]);
}
