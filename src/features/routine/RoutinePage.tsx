import { useLiveQuery } from 'dexie-react-hooks';
import { Flame, Pencil, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createHabit, routineData, statusOn, type RoutineData } from '../../db/habits';
import type { Habit } from '../../db/schema';
import { dayKey, dayTitle, formatMinutes, fromKey, gridWeeks, overallLevel, streaks, type DayStatus } from '../../lib/routine/calendar';
import { EMPTY, OVERALL_COLOR, ramp } from '../../lib/routine/ramp';
import { useUi, type Theme } from '../../store/ui';
import HomeLayout from '../HomeLayout';
import ContributionGrid, { GridLegend, type Cell } from './ContributionGrid';
import DaySheet from './DaySheet';
import HabitDialog from './HabitDialog';
import HabitRow, { daysText, goalText } from './HabitRow';
import { habitIcon, TEMPLATES } from './icons';

/** Today's key, kept current past midnight while the app stays open. */
function useToday() {
  const [today, setToday] = useState(() => dayKey(new Date()));
  useEffect(() => {
    const check = () => setToday(dayKey(new Date()));
    const t = setInterval(check, 60_000);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);
  return today;
}

/** A habit counts on a day from the day it was made (or earlier, if something was logged or measured then). */
const counts = (habit: Habit, day: string, s: DayStatus) => day >= dayKey(new Date(habit.createdAt)) || s.value > 0;

const shortDate = (day: string) => fromKey(day).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });

/**
 * The routine: today's habits to tick off, the year in a grid (all habits together) and a grid
 * per habit with its streak. A day in a grid opens it, to fix it or mark days off.
 */
export default function RoutinePage() {
  const today = useToday();
  const theme = useUi((s) => s.theme);
  const weeks = useMemo(() => gridWeeks(fromKey(today), 53), [today]);
  const from = weeks[0].days[0]!;
  const data = useLiveQuery(() => routineData(from, today), [from, today]);
  const [editing, setEditing] = useState<Habit | 'new' | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const habits = data?.habits.filter((h) => !h.archived) ?? [];
  const archived = data?.habits.filter((h) => h.archived) ?? [];

  return (
    <HomeLayout active="routine">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--border)] bg-[var(--panel)]/90 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mr-auto">
          <h1 className="font-serif text-2xl font-bold">Rotina</h1>
          <div className="text-[13px] text-[var(--muted)]">{dayTitle(today)}</div>
        </div>
        <button className="flex h-11 items-center gap-2 rounded-full bg-amber-500 px-4 text-sm font-semibold text-stone-900 hover:bg-amber-400" onClick={() => setEditing('new')}>
          <Plus className="size-4" /> Novo hábito
        </button>
      </header>

      <main className="p-4 sm:p-6">
        {data && !data.habits.length && <Empty />}
        {data && !!habits.length && (
          <div className="flex flex-col gap-6">
            <Today habits={habits} data={data} today={today} />
            <Year habits={habits} data={data} weeks={weeks} today={today} theme={theme} onPick={setPicked} />
            <section>
              <h2 className="mb-2.5 text-[17px] font-semibold">Hábitos</h2>
              <div className="grid gap-3 lg:grid-cols-2">
                {habits.map((h) => (
                  <HabitCard key={h.id} habit={h} data={data} weeks={weeks} today={today} theme={theme} onPick={setPicked} onEdit={() => setEditing(h)} />
                ))}
              </div>
            </section>
            <Suggestions habits={data.habits} />
          </div>
        )}
        {!!archived.length && (
          <section className="mt-6">
            <button className="text-sm text-[var(--muted)] underline" aria-expanded={showArchived} onClick={() => setShowArchived((s) => !s)}>
              Arquivados ({archived.length})
            </button>
            {showArchived && (
              <ul className="mt-2 flex flex-col gap-1">
                {archived.map((h) => (
                  <li key={h.id}>
                    <button className="text-sm hover:underline" onClick={() => setEditing(h)}>
                      {h.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>

      {editing && <HabitDialog habit={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {picked && data && <DaySheet day={picked} habits={habits} data={data} onClose={() => setPicked(null)} />}
    </HomeLayout>
  );
}

function Today({ habits, data, today }: { habits: Habit[]; data: RoutineData; today: string }) {
  const rows = habits.map((h) => ({ habit: h, status: statusOn(data, h, today) }));
  const due = rows.filter((r) => !r.status.off);
  const resting = rows.filter((r) => r.status.off);
  return (
    <section>
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h2 className="text-[17px] font-semibold">Hoje</h2>
        <span className="text-[13px] text-[var(--muted)]">
          {due.length ? `${due.filter((r) => r.status.met).length} de ${due.length} feitos` : 'Dia de folga'}
        </span>
      </div>
      <div className="divide-y divide-[var(--border)] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--panel)]">
        {[...due, ...resting].map(({ habit, status }) => (
          <HabitRow key={habit.id} habit={habit} status={status} day={today} />
        ))}
      </div>
    </section>
  );
}

function Year({ habits, data, weeks, today, theme, onPick }: { habits: Habit[]; data: RoutineData; weeks: ReturnType<typeof gridWeeks>; today: string; theme: Theme; onPick: (d: string) => void }) {
  const shades = ramp(OVERALL_COLOR, theme);
  const overall = useMemo(() => {
    const byDay = new Map<string, ReturnType<typeof overallLevel>>();
    for (const w of weeks)
      for (const day of w.days) {
        if (!day) continue;
        const statuses = habits.map((h) => statusOn(data, h, day)).filter((s, i) => counts(habits[i], day, s));
        byDay.set(day, statuses.length ? overallLevel(statuses) : 0);
      }
    return byDay;
  }, [habits, data, weeks]);

  const cell = (day: string): Cell => {
    const lvl = overall.get(day) ?? 0;
    const label = `${shortDate(day)}: ${lvl === 'off' ? 'folga' : lvl === 4 ? 'tudo feito' : lvl === 0 ? 'nada feito' : 'parte feita'}`;
    return lvl === 'off' ? { off: true, label } : { fill: lvl ? shades[lvl - 1] : EMPTY[theme], label };
  };

  // Days with everything done in a row (days off skipped), and this month's goals met.
  const first = weeks[0].days[0]!;
  const allDone = streaks(
    (k) => {
      const lvl = overall.get(k) ?? 0;
      return { met: lvl === 4, off: lvl === 'off' ? 'dayoff' : null, value: 0, level: 0 };
    },
    fromKey(first),
    fromKey(today),
  );
  const month = today.slice(0, 7);
  let due = 0;
  let met = 0;
  let minutes = 0;
  for (let d = fromKey(`${month}-01`); dayKey(d) <= today; d.setDate(d.getDate() + 1)) {
    const k = dayKey(d);
    for (const h of habits) {
      const s = statusOn(data, h, k);
      if (s.off || !counts(h, k, s)) continue;
      due++;
      if (s.met) met++;
    }
    minutes += ((data.activity.get(`reading|${k}`) ?? 0) + (data.activity.get(`study|${k}`) ?? 0)) / 60;
  }

  const tile = 'rounded-xl bg-[var(--app-bg)] p-3';
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[17px] font-semibold">Seu ano</h2>
        <GridLegend shades={[EMPTY[theme], ...shades]} />
      </div>
      <ContributionGrid weeks={weeks} cell={cell} today={today} onPick={onPick} labels title="Todos os hábitos, dia a dia, no último ano" />
      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <div className={tile}>
          <div className="text-xl font-bold">{allDone.current}</div>
          <div className="text-xs text-[var(--muted)]">dias com tudo feito, seguidos</div>
        </div>
        <div className={tile}>
          <div className="text-xl font-bold">{allDone.best}</div>
          <div className="text-xs text-[var(--muted)]">recorde</div>
        </div>
        <div className={tile}>
          <div className="text-xl font-bold">{due ? `${Math.round((met / due) * 100)}%` : '—'}</div>
          <div className="text-xs text-[var(--muted)]">das metas neste mês</div>
        </div>
        <div className={tile}>
          <div className="text-xl font-bold">{formatMinutes(minutes)}</div>
          <div className="text-xs text-[var(--muted)]">lendo e estudando no mês</div>
        </div>
      </div>
    </section>
  );
}

function HabitCard({
  habit,
  data,
  weeks,
  today,
  theme,
  onPick,
  onEdit,
}: {
  habit: Habit;
  data: RoutineData;
  weeks: ReturnType<typeof gridWeeks>;
  today: string;
  theme: Theme;
  onPick: (d: string) => void;
  onEdit: () => void;
}) {
  const Icon = habitIcon(habit.icon);
  const shades = ramp(habit.color, theme);
  const recent = weeks.slice(-26);
  const created = dayKey(new Date(habit.createdAt));
  const statusOf = (k: string) => {
    const s = statusOn(data, habit, k);
    // Before the habit existed, an empty day neither breaks nor counts.
    return k < created && !s.value ? { ...s, off: 'unscheduled' as const } : s;
  };
  const { current, best } = streaks(statusOf, fromKey(weeks[0].days[0]!), fromKey(today));
  const cell = (day: string): Cell => {
    const s = statusOn(data, habit, day);
    const label = `${shortDate(day)}: ${s.off && !s.value ? 'folga' : habit.kind === 'check' ? (s.met ? 'feito' : 'não feito') : habit.kind === 'time' ? formatMinutes(s.value) : `${s.value} ${habit.unit ?? ''}`}`;
    if (s.off && day >= created) return { off: true, label };
    return { fill: s.level ? shades[s.level - 1] : EMPTY[theme], label };
  };

  return (
    <article className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-3.5">
      <div className="mb-3 flex items-center gap-2.5">
        <Icon className="size-[18px] shrink-0" style={{ color: habit.color }} />
        <h3 className="min-w-0 flex-1 truncate text-[15px] font-semibold">{habit.name}</h3>
        <span className="flex items-center gap-1 text-[13px] font-semibold text-[var(--accent-text)]" title="Sequência atual">
          <Flame className="size-3.5" /> {current}
        </span>
        <button aria-label={`Editar ${habit.name}`} onClick={onEdit} className="flex size-9 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--app-bg)]">
          <Pencil className="size-4" />
        </button>
      </div>
      <ContributionGrid weeks={recent} cell={cell} today={today} onPick={onPick} title={`${habit.name} nos últimos 6 meses`} />
      <div className="mt-2.5 flex flex-wrap justify-between gap-x-3 text-xs text-[var(--muted)]">
        <span>
          {goalText(habit)} · {daysText(habit.days)}
          {habit.holidaysOff ? ' · feriado é folga' : ''}
        </span>
        <span>Recorde: {best}</span>
      </div>
    </article>
  );
}

/** "Mais ideias": the ready-made habits not added yet, one tap each. */
function Suggestions({ habits }: { habits: Habit[] }) {
  const left = TEMPLATES.filter((t) => !habits.some((h) => h.name === t.name));
  if (!left.length) return null;
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-[var(--muted)]">Mais ideias</h2>
      <div className="flex flex-wrap gap-2">
        {left.map(({ detail, ...t }) => {
          const Icon = habitIcon(t.icon);
          return (
            <button key={t.name} title={detail} onClick={() => createHabit(t)} className="flex h-11 items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--panel)] pr-4 pl-3 text-sm hover:border-amber-500">
              <Icon className="size-4" style={{ color: t.color }} />
              {t.name}
              <Plus className="size-3.5 text-[var(--muted)]" />
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** First visit: the ready-made habits, one tap each, or one from scratch. */
function Empty() {
  return (
    <div className="mx-auto max-w-xl pt-4 text-center">
      <h2 className="text-xl font-bold">Comece com o que importa para você</h2>
      <p className="mx-auto mt-2 mb-5 max-w-md text-sm leading-relaxed text-[var(--muted)]">
        Cada dia que você cumpre um hábito pinta um quadradinho. Leitura e estudo podem contar sozinhos, pelo tempo que você passa nos livros e cadernos.
      </p>
      <div className="grid grid-cols-2 gap-2.5 text-left sm:grid-cols-3">
        {TEMPLATES.map(({ detail, ...t }) => {
          const Icon = habitIcon(t.icon);
          return (
            <button key={t.name} onClick={() => createHabit(t)} className="flex min-h-28 flex-col items-start gap-2 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-3.5 hover:border-amber-500">
              <Icon className="size-5" style={{ color: t.color }} />
              <span className="text-[15px] font-semibold">{t.name}</span>
              <span className="text-xs leading-snug text-[var(--muted)]">{detail}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
