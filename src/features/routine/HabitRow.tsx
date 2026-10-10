import { Check, Minus, Plus } from 'lucide-react';
import { bump, setOff, setValue } from '../../db/habits';
import type { Habit } from '../../db/schema';
import { formatMinutes, holidayName, type DayStatus } from '../../lib/routine/calendar';
import { inkOn, mix, SURFACE } from '../../lib/routine/ramp';
import { useUi } from '../../store/ui';
import { habitIcon } from './icons';

const SHORT_DAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/** "seg a sex", "fim de semana", "ter · qui · sáb", "todo dia". */
export function daysText(days?: number[]) {
  if (!days || days.length === 7) return 'todo dia';
  const sorted = [...days].sort();
  if (sorted.join() === '1,2,3,4,5') return 'seg a sex';
  if (sorted.join() === '0,6') return 'fim de semana';
  return sorted.map((d) => SHORT_DAYS[d]).join(' · ');
}

/** The goal in words: "8 copos", "30 min", "feito ou não". */
export function goalText(habit: Habit) {
  if (habit.kind === 'check') return 'feito ou não';
  if (habit.kind === 'time') return formatMinutes(habit.goal);
  return `${habit.goal} ${habit.unit ?? ''}`.trim();
}

/** How a day went, in words. */
export function statusText(habit: Habit, status: DayStatus, day: string) {
  if (status.off && !status.value) {
    if (status.off === 'unscheduled') return `Descanso (${daysText(habit.days)})`;
    if (status.off === 'holiday') return `Folga: ${holidayName(day)}`;
    return status.off === 'dayoff' ? 'Folga em tudo neste dia' : 'Folga';
  }
  if (habit.kind === 'check') return status.met ? 'Feito' : 'Ainda não';
  if (habit.kind === 'time') return `${formatMinutes(status.value)} de ${formatMinutes(habit.goal)}`;
  return `${status.value} de ${habit.goal} ${habit.unit ?? ''}`.trim();
}

const round = 'flex size-11 shrink-0 items-center justify-center rounded-full';
const pill = 'h-11 shrink-0 rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 text-[13px] font-semibold hover:bg-[var(--app-bg)]';

/**
 * A habit on a day, with what's needed to log it: done, − / +, + 15 min. `dayOff` adds the
 * day-off switch (the day's detail).
 */
export default function HabitRow({ habit, status, day, dayOff = false }: { habit: Habit; status: DayStatus; day: string; dayOff?: boolean }) {
  const theme = useUi((s) => s.theme);
  const Icon = habitIcon(habit.icon);
  const resting = !!status.off && !status.value;
  const step = habit.kind === 'time' ? 15 : (habit.step ?? 1);
  const pct = habit.kind === 'check' ? 0 : Math.min(100, (status.value / habit.goal) * 100);
  const ownOff = status.off === 'off';

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl" style={{ background: mix(habit.color, SURFACE[theme], 0.16), color: habit.color }}>
        <Icon className="size-5" />
      </span>
      <div className="min-w-40 flex-1 basis-0">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[15px] font-semibold">{habit.name}</span>
          {habit.auto && <span className="shrink-0 rounded-full bg-[var(--app-bg)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--muted)]">automático</span>}
        </div>
        <div className="truncate text-[13px] text-[var(--muted)]">{statusText(habit, status, day)}</div>
        {habit.kind !== 'check' && !resting && (
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--app-bg)]">
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: habit.color }} />
          </div>
        )}
      </div>

      {/* The buttons go under the name when they don't fit beside it (the day's detail on a phone). */}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {dayOff && (
          <button className={pill} aria-pressed={ownOff} onClick={() => setOff(habit.id, day, !ownOff)}>
            {ownOff ? 'Tirar folga' : 'Folga'}
          </button>
        )}
        {habit.kind === 'check' ? (
          resting ? (
            <button className={pill} onClick={() => setValue(habit.id, day, 1)}>
              {dayOff ? 'Fiz mesmo assim' : 'Fiz hoje'}
            </button>
          ) : (
            <button
              aria-label={status.met ? `Desmarcar ${habit.name}` : `Marcar ${habit.name} como feito`}
              aria-pressed={status.met}
              onClick={() => setValue(habit.id, day, status.met ? 0 : 1)}
              className={`${round} ${status.met ? '' : 'border border-[var(--border)] bg-[var(--panel)] text-[var(--muted)]'}`}
              style={status.met ? { background: habit.color, color: inkOn(habit.color) } : undefined}
            >
              <Check className="size-5" strokeWidth={2.5} />
            </button>
          )
        ) : (
          <>
            {(dayOff || habit.kind === 'count') && status.value > 0 && (
              <button aria-label={`Menos em ${habit.name}`} onClick={() => bump(habit, day, -step)} className={`${round} border border-[var(--border)] bg-[var(--panel)]`}>
                <Minus className="size-[18px]" />
              </button>
            )}
            {habit.kind === 'count' ? (
              <button aria-label={`Mais em ${habit.name}`} onClick={() => bump(habit, day, step)} className={round} style={{ background: habit.color, color: inkOn(habit.color) }}>
                <Plus className="size-[18px]" />
              </button>
            ) : (
              <button className={pill} onClick={() => bump(habit, day, step)}>
                +15 min
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
