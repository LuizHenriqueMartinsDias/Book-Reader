import { Check, Minus, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { addAmount, bump, removeAmount, setOff, setValue } from '../../db/habits';
import type { Habit, HabitLog } from '../../db/schema';
import { formatAmount, formatMinutes, holidayName, type DayStatus } from '../../lib/routine/calendar';
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

/** The goal in words: "2 L", "8 copos", "30 min", "feito ou não". */
export function goalText(habit: Habit) {
  if (habit.kind === 'check') return 'feito ou não';
  if (habit.kind === 'time') return formatMinutes(habit.goal);
  return formatAmount(habit.goal, habit.unit);
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
  return `${formatAmount(status.value, habit.unit)} de ${goalText(habit)}`;
}

const round = 'flex size-11 shrink-0 items-center justify-center rounded-full';
const pill = 'h-11 shrink-0 rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 text-[13px] font-semibold hover:bg-[var(--app-bg)]';

/**
 * A habit on a day, with what's needed to log it: done, − / +, the habit's quick amounts
 * (+200, +500 ml, or any other), + 15 min. `dayOff` is the day's detail: it adds the day-off
 * switch and the list of what was added, each one removable.
 */
export default function HabitRow({ habit, status, day, log, dayOff = false }: { habit: Habit; status: DayStatus; day: string; log?: HabitLog; dayOff?: boolean }) {
  const theme = useUi((s) => s.theme);
  const [other, setOther] = useState<string | null>(null);
  const Icon = habitIcon(habit.icon);
  const resting = !!status.off && !status.value;
  const step = habit.kind === 'time' ? 15 : (habit.step ?? 1);
  const pct = habit.kind === 'check' ? 0 : Math.min(100, (status.value / habit.goal) * 100);
  const ownOff = status.off === 'off';
  const amounts = habit.kind === 'count' ? (habit.amounts ?? []) : [];
  const entries = log?.entries ?? [];
  const unit = habit.unit ?? '';
  const filled = { background: habit.color, color: inkOn(habit.color) };

  const addOther = () => {
    const amount = Math.round(Number((other ?? '').replace(',', '.')));
    if (amount > 0) addAmount(habit.id, day, amount);
    setOther(null);
  };

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

      {/* The buttons go under the name when they don't fit beside it (on a phone). */}
      <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
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
              style={status.met ? filled : undefined}
            >
              <Check className="size-5" strokeWidth={2.5} />
            </button>
          )
        ) : amounts.length ? (
          <>
            {status.value > 0 && (
              <button
                aria-label={entries.length ? `Tirar o último (${formatAmount(entries[entries.length - 1], unit)})` : `Menos em ${habit.name}`}
                title="Tirar o último"
                onClick={() => (entries.length ? removeAmount(habit.id, day) : bump(habit, day, -step))}
                className={`${round} border border-[var(--border)] bg-[var(--panel)]`}
              >
                <Minus className="size-[18px]" />
              </button>
            )}
            {amounts.map((a) => (
              <button key={a} aria-label={`Mais ${formatAmount(a, unit)} em ${habit.name}`} onClick={() => addAmount(habit.id, day, a)} className="h-11 shrink-0 rounded-full px-3 text-[13px] font-semibold" style={filled}>
                +{a}
              </button>
            ))}
            <button className={pill} aria-expanded={other !== null} onClick={() => setOther((o) => (o === null ? '' : null))}>
              Outro
            </button>
          </>
        ) : (
          <>
            {(dayOff || habit.kind === 'count') && status.value > 0 && (
              <button aria-label={`Menos em ${habit.name}`} onClick={() => bump(habit, day, -step)} className={`${round} border border-[var(--border)] bg-[var(--panel)]`}>
                <Minus className="size-[18px]" />
              </button>
            )}
            {habit.kind === 'count' ? (
              <button aria-label={`Mais em ${habit.name}`} onClick={() => bump(habit, day, step)} className={round} style={filled}>
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

      {other !== null && (
        <form
          className="flex basis-full items-center justify-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            addOther();
          }}
        >
          <label className="flex h-11 items-center gap-2 rounded-full border border-[var(--border)] px-4 focus-within:border-amber-500">
            <span className="sr-only">Quantidade</span>
            <input autoFocus inputMode="numeric" value={other} onChange={(e) => setOther(e.target.value.replace(/[^\d,.]/g, ''))} placeholder="350" className="w-20 bg-transparent text-right outline-none" />
            <span className="text-sm text-[var(--muted)]">{unit}</span>
          </label>
          <button className="h-11 rounded-full px-4 text-sm font-semibold" style={filled}>
            Adicionar
          </button>
        </form>
      )}

      {dayOff && entries.length > 0 && (
        <ul aria-label="Adicionado neste dia" className="flex basis-full flex-wrap justify-end gap-1.5">
          {entries.map((e, i) => (
            <li key={i}>
              <button
                aria-label={`Tirar ${formatAmount(e, unit)}`}
                onClick={() => removeAmount(habit.id, day, i)}
                className="flex h-8 items-center gap-1 rounded-full bg-[var(--app-bg)] pr-2 pl-3 text-xs font-semibold hover:brightness-95"
              >
                {formatAmount(e, unit)} <X className="size-3.5 text-[var(--muted)]" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
