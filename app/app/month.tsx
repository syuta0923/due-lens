/**
 * S8 月のカレンダー
 *
 * Google カレンダーの月表示のように、日付のマスに締切を小さく書く。マスを押すと、
 * その日の締切を下に一覧で出す（マスの中は字が小さく、全部は読めないため）。
 *
 * 出すのは締切一覧（store の deadlines）と同じもの。端末のカレンダーは読まない。
 * 読むと権限が要り、他のアプリの予定まで混ざって締切が埋もれるため。
 * マス目の計算は shared/src/month.ts（Date を使わない・テストがある）。
 */
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  WEEKDAY_TO_KANJI, WEEKDAYS, addMonths, formatDate, formatJa, holidayName, inMonth, isHoliday, monthGrid,
  parseDate, type YearMonth,
} from "@syllabus/shared";
import { todayLocal } from "../lib/device";
import { useAppStore, type Deadline } from "../store/useAppStore";
import { Card } from "../components/Card";
import { shape, spacing, type, useTheme, TOUCH_TARGET } from "../lib/theme";

/** 1 マスに書く件数。これより多い日は「+2」のようにまとめる */
const MAX_IN_CELL = 2;

export default function Month() {
  const deadlines = useAppStore((s) => s.deadlines);
  const { colors } = useTheme();
  const today = todayLocal();

  const [ym, setYm] = useState<YearMonth>(() => {
    const { y, m } = parseDate(today);
    return { y, m };
  });
  const [selected, setSelected] = useState(today);

  // 日付 → その日の締切（時刻順）。マスごとに deadlines を探し直すと 42 マス × 件数になるので先にまとめる
  const byDate = useMemo(() => {
    const map = new Map<string, Deadline[]>();
    for (const d of deadlines) {
      const list = map.get(d.date) ?? [];
      list.push(d);
      map.set(d.date, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.time ?? "99:99").localeCompare(b.time ?? "99:99"));
    }
    return map;
  }, [deadlines]);

  const weeks = useMemo(() => monthGrid(ym), [ym]);
  const selectedList = byDate.get(selected) ?? [];
  const holiday = holidayName(selected);

  /** 日曜・祝日は赤、土曜は青（日本のカレンダーの慣習） */
  function dayColor(date: string, weekdayIndex: number): string {
    if (weekdayIndex === 0 || isHoliday(date)) return colors.error;
    if (weekdayIndex === 6) return colors.primary;
    return colors.onSurface;
  }

  function move(n: number) {
    const next = addMonths(ym, n);
    setYm(next);
    // 月を変えたら、その月の 1 日（今月なら今日）を選び直す。前の月の日が選ばれたままだと下の一覧が月と合わない
    setSelected(inMonth(today, next) ? today : formatDate({ ...next, d: 1 }));
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <NavButton label="‹" hint="前の月" onPress={() => move(-1)} />
        <Text style={[type.titleLarge, styles.headerTitle, { color: colors.onSurface }]}>
          {ym.y}年{ym.m}月
        </Text>
        <NavButton label="›" hint="次の月" onPress={() => move(1)} />
        <Pressable
          onPress={() => {
            const { y, m } = parseDate(today);
            setYm({ y, m });
            setSelected(today);
          }}
          accessibilityRole="button"
          style={[styles.todayButton, { borderColor: colors.outline }]}
        >
          <Text style={[type.labelLarge, { color: colors.primary }]}>今日</Text>
        </Pressable>
      </View>

      <View style={[styles.grid, { borderColor: colors.outlineVariant }]}>
        <View style={styles.week}>
          {WEEKDAYS.map((w, i) => (
            <Text
              key={w}
              style={[
                type.labelMedium,
                styles.weekdayLabel,
                { color: i === 0 ? colors.error : i === 6 ? colors.primary : colors.onSurfaceVariant },
              ]}
            >
              {WEEKDAY_TO_KANJI[w]}
            </Text>
          ))}
        </View>

        {weeks.map((week) => (
          <View key={week[0]} style={[styles.week, { borderTopColor: colors.outlineVariant }, styles.weekLine]}>
            {week.map((date, i) => {
              const list = byDate.get(date) ?? [];
              const isSelected = date === selected;
              const isToday = date === today;
              const outside = !inMonth(date, ym);

              return (
                <Pressable
                  key={date}
                  onPress={() => setSelected(date)}
                  accessibilityRole="button"
                  accessibilityLabel={`${formatJa(date)}、締切 ${list.length} 件`}
                  accessibilityState={{ selected: isSelected }}
                  style={[
                    styles.cell,
                    isSelected && { backgroundColor: colors.surfaceContainerHigh },
                    outside && styles.outside,
                  ]}
                >
                  <View
                    style={[styles.dayNumber, isToday && { backgroundColor: colors.primary }]}
                  >
                    <Text
                      style={[
                        type.labelMedium,
                        { color: isToday ? colors.onPrimary : dayColor(date, i) },
                      ]}
                    >
                      {parseDate(date).d}
                    </Text>
                  </View>

                  {list.slice(0, MAX_IN_CELL).map((d) => (
                    <Chip key={d.key} d={d} />
                  ))}
                  {list.length > MAX_IN_CELL ? (
                    <Text style={[styles.more, { color: colors.onSurfaceVariant }]}>
                      +{list.length - MAX_IN_CELL}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={[type.titleMedium, { color: colors.onSurface }]}>
          {formatJa(selected)}
          {holiday ? `・${holiday}` : ""}
        </Text>
        {selectedList.length === 0 ? (
          <Text style={[type.bodyMedium, { color: colors.onSurfaceVariant }]}>締切はありません</Text>
        ) : (
          selectedList.map((d) => (
            <Card key={d.key}>
              <Text
                style={[
                  type.bodyLarge,
                  styles.title,
                  { color: d.done ? colors.outline : colors.onSurface },
                  d.done && styles.strike,
                ]}
              >
                {d.title}
              </Text>
              <Text style={[type.bodyMedium, { color: colors.onSurfaceVariant }]}>
                {d.time ?? "終日"} ・ {d.type === "exam" ? "試験 ・ " : ""}
                {d.course}
                {d.done ? " ・ 完了" : ""}
              </Text>
            </Card>
          ))
        )}
      </View>
    </ScrollView>
  );
}

/** マスの中の小さな予定。試験と課題で色を分け、完了は薄くして線を引く */
function Chip({ d }: { d: Deadline }) {
  const { colors } = useTheme();
  const bg = d.done
    ? colors.surfaceContainer
    : d.type === "exam"
      ? colors.warningContainer
      : colors.primaryContainer;
  const fg = d.done
    ? colors.outline
    : d.type === "exam"
      ? colors.onWarningContainer
      : colors.onPrimaryContainer;

  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <Text numberOfLines={1} style={[styles.chipText, { color: fg }, d.done && styles.strike]}>
        {d.title}
      </Text>
    </View>
  );
}

function NavButton(props: { label: string; hint: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={props.hint}
      hitSlop={8}
      style={styles.nav}
    >
      <Text style={[styles.navText, { color: colors.onSurface }]}>{props.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, gap: spacing.lg },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  headerTitle: { flex: 1, textAlign: "center" },
  nav: { width: TOUCH_TARGET, height: TOUCH_TARGET, alignItems: "center", justifyContent: "center" },
  navText: { fontSize: 28, lineHeight: 32 },
  todayButton: {
    borderWidth: 1,
    borderRadius: shape.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginLeft: spacing.sm,
  },
  grid: { borderBottomWidth: StyleSheet.hairlineWidth },
  week: { flexDirection: "row" },
  weekLine: { borderTopWidth: StyleSheet.hairlineWidth },
  weekdayLabel: { flex: 1, textAlign: "center", paddingVertical: spacing.xs },
  // 高さを固定する。中身の件数で行の高さが変わると、マス目がそろわない
  cell: { flex: 1, height: 76, paddingHorizontal: 1, paddingTop: 2, gap: 2, overflow: "hidden" },
  outside: { opacity: 0.4 },
  dayNumber: {
    alignSelf: "center",
    minWidth: 22,
    height: 22,
    borderRadius: shape.full,
    alignItems: "center",
    justifyContent: "center",
  },
  chip: { borderRadius: shape.xs, paddingHorizontal: 2 },
  // マスは画面幅の 1/7（約 50dp）しかないので、theme の type より小さい専用の字にする
  chipText: { fontSize: 10, lineHeight: 14 },
  more: { fontSize: 10, lineHeight: 12, textAlign: "center" },
  section: { gap: spacing.sm },
  title: { fontWeight: "600" },
  strike: { textDecorationLine: "line-through" },
});
