import { X } from 'lucide-react';
import { useState } from 'react';
import { setDaysOff, statusOn, type RoutineData } from '../../db/habits';
import type { Habit } from '../../db/schema';
import { dayTitle, holidayName } from '../../lib/routine/calendar';
import HabitRow from './HabitRow';

const pill = 'h-11 rounded-full border border-[var(--border)] bg-[var(--app-bg)] px-4 text-[13px] font-semibold hover:brightness-95';

/**
 * A day from the grid: how each habit went, to fix a forgotten day, and its days off (one
 * habit, every habit, or a stretch of days for a trip). A sheet from the bottom on phones.
 */
export default function DaySheet({ day, habits, data, onClose }: { day: string; habits: Habit[]; data: RoutineData; onClose: () => void }) {
  const holiday = holidayName(day);
  const allOff = data.dayOffs.has(day);
  const statuses = habits.map((h) => statusOn(data, h, day));
  const due = statuses.filter((s) => !s.off);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center md:p-4" onClick={onClose}>
      <section
        aria-label={dayTitle(day)}
        className="max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl bg-[var(--panel)] px-4 pt-2.5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl md:max-w-lg md:rounded-2xl md:pt-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--border)] md:hidden" />
        <div className="mb-2 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold">{dayTitle(day)}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-[var(--muted)]">
              {holiday && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-[var(--accent-text)]">Feriado · {holiday}</span>}
              {allOff && <span className="rounded-full bg-[var(--app-bg)] px-2 py-0.5 text-[11px] font-semibold">Folga em tudo</span>}
              {due.length ? `${due.filter((s) => s.met).length} de ${due.length} metas do dia` : 'Dia de folga'}
            </div>
          </div>
          <button aria-label="Fechar" onClick={onClose} className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--app-bg)]">
            <X className="size-[18px]" />
          </button>
        </div>

        <div className="-mx-3.5 divide-y divide-[var(--border)]">
          {habits.map((h, i) => (
            <HabitRow key={h.id} habit={h} status={statuses[i]} day={day} log={data.logs.get(`${h.id}|${day}`)} dayOff />
          ))}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button className={pill} aria-pressed={allOff} onClick={() => setDaysOff(day, day, !allOff)}>
            {allOff ? 'Tirar folga geral' : 'Folga em tudo neste dia'}
          </button>
          <button className={pill} aria-expanded={!!range} onClick={() => setRange((r) => (r ? null : { from: day, to: day }))}>
            Folga de… até…
          </button>
        </div>
        {range && (
          <form
            className="mt-3 flex flex-wrap items-end gap-2 rounded-xl border border-[var(--border)] p-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (range.from > range.to) return;
              await setDaysOff(range.from, range.to, true);
              setRange(null);
            }}
          >
            <label className="flex flex-1 flex-col text-xs text-[var(--muted)]">
              De
              <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} className="mt-1 h-11 rounded-lg border border-[var(--border)] bg-transparent px-2 text-sm text-[var(--app-fg)]" />
            </label>
            <label className="flex flex-1 flex-col text-xs text-[var(--muted)]">
              Até
              <input type="date" value={range.to} min={range.from} onChange={(e) => setRange({ ...range, to: e.target.value })} className="mt-1 h-11 rounded-lg border border-[var(--border)] bg-transparent px-2 text-sm text-[var(--app-fg)]" />
            </label>
            <button className="h-11 rounded-full bg-amber-500 px-4 text-sm font-semibold text-stone-900 hover:bg-amber-400">Marcar folga</button>
          </form>
        )}
      </section>
    </div>
  );
}
