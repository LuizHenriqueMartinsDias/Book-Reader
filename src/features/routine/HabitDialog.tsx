import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { archiveHabit, createHabit, deleteHabit, updateHabit, type NewHabit } from '../../db/habits';
import type { ActivityKind, Habit, HabitKind } from '../../db/schema';
import ColorPicker from '../ColorPicker';
import { HABIT_COLORS, HABIT_ICONS } from './icons';

const KINDS: { id: HabitKind; title: string; hint: string }[] = [
  { id: 'check', title: 'Feito ou não', hint: 'Academia, dormir cedo' },
  { id: 'count', title: 'Quantidade', hint: 'Copos de água, páginas' },
  { id: 'time', title: 'Tempo', hint: 'Estudo, leitura, treino' },
];
const AUTOS: { id: ActivityKind | null; title: string; hint: string }[] = [
  { id: null, title: 'Não, eu registro', hint: 'Você soma o tempo à mão' },
  { id: 'reading', title: 'Tempo lendo livros', hint: 'Minutos com um livro aberto e em uso' },
  { id: 'study', title: 'Tempo nos cadernos', hint: 'Minutos escrevendo ou desenhando nos cadernos' },
];
const DAYS = [
  ['D', 'Domingo'],
  ['S', 'Segunda'],
  ['T', 'Terça'],
  ['Q', 'Quarta'],
  ['Q', 'Quinta'],
  ['S', 'Sexta'],
  ['S', 'Sábado'],
];

const label = 'mb-1.5 block text-xs font-medium text-[var(--muted)]';
const choice = (on: boolean) => `rounded-xl border px-3 py-2 text-left ${on ? 'border-amber-500 bg-amber-500/10' : 'border-[var(--border)]'}`;
const field = 'h-11 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 outline-none focus:border-amber-500';

/** Creating a habit (from scratch or a template) or changing one: name, look, how it's logged, its days. */
export default function HabitDialog({ habit, onClose }: { habit?: Habit; onClose: () => void }) {
  const [draft, setDraft] = useState<NewHabit>(
    () =>
      habit ?? {
        name: '',
        icon: 'heart',
        color: HABIT_COLORS[0],
        kind: 'check',
        goal: 1,
      },
  );
  const [mixing, setMixing] = useState(false);
  const set = (patch: Partial<NewHabit>) => setDraft((d) => ({ ...d, ...patch }));
  const days = draft.days ?? [0, 1, 2, 3, 4, 5, 6];
  // A time goal is typed in minutes or hours, whichever the user picks (hours to begin with past an hour).
  const [inHours, setInHours] = useState(() => !!habit && habit.kind === 'time' && habit.goal >= 60 && habit.goal % 15 === 0);
  const hours = draft.kind === 'time' && inHours;

  const save = async () => {
    const clean: NewHabit = {
      ...draft,
      name: draft.name.trim() || 'Hábito',
      goal: draft.kind === 'check' ? 1 : Math.max(1, draft.goal),
      days: days.length === 7 ? undefined : days,
      auto: draft.kind === 'time' ? draft.auto : undefined,
      unit: draft.kind === 'count' ? draft.unit : undefined,
    };
    if (habit) await updateHabit(habit.id, clean);
    else await createHabit(clean);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form
        className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-[var(--panel)] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{habit ? 'Editar hábito' : 'Novo hábito'}</h2>
          <button type="button" aria-label="Fechar" className="rounded-md p-1 hover:bg-[var(--app-bg)]" onClick={onClose}>
            <X className="size-5" />
          </button>
        </div>

        <label htmlFor="habit-name" className={label}>
          Nome
        </label>
        <input id="habit-name" autoFocus={!habit} value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ex.: Água, Academia, Inglês" className={`${field} mb-4`} />

        <div className={label}>Ícone e cor</div>
        <div className="mb-2 grid grid-cols-8 gap-1.5">
          {Object.entries(HABIT_ICONS).map(([id, { icon: Icon, label: name }]) => (
            <button
              key={id}
              type="button"
              aria-label={name}
              aria-pressed={draft.icon === id}
              onClick={() => set({ icon: id })}
              className={`flex aspect-square items-center justify-center rounded-lg border ${draft.icon === id ? 'border-amber-500 bg-amber-500/10' : 'border-[var(--border)]'}`}
              style={{ color: draft.icon === id ? draft.color : undefined }}
            >
              <Icon className="size-[18px]" />
            </button>
          ))}
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          {HABIT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Cor ${c}`}
              aria-pressed={draft.color === c}
              onClick={() => set({ color: c })}
              className="size-8 rounded-full"
              style={{ background: c, boxShadow: draft.color === c ? `0 0 0 2px var(--panel), 0 0 0 4px ${c}` : undefined }}
            />
          ))}
          <button
            type="button"
            aria-label="Outra cor"
            aria-expanded={mixing}
            onClick={() => setMixing((m) => !m)}
            className="flex size-8 items-center justify-center rounded-full"
            style={{ background: HABIT_COLORS.includes(draft.color) ? 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' : draft.color }}
          >
            <Plus className="size-4 text-white drop-shadow" />
          </button>
        </div>
        {mixing && (
          <div className="mb-4 rounded-lg border border-[var(--border)] p-2">
            <ColorPicker value={draft.color} onChange={(color) => set({ color })} onCommit={() => {}} />
          </div>
        )}

        <div className={label}>Como você registra</div>
        <div className="mb-4 grid grid-cols-3 gap-2">
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              aria-pressed={draft.kind === k.id}
              onClick={() => set({ kind: k.id, goal: k.id === 'check' ? 1 : k.id === 'time' ? 30 : 8, unit: k.id === 'count' ? (draft.unit ?? 'vezes') : undefined })}
              className={choice(draft.kind === k.id)}
            >
              <div className="text-sm font-semibold">{k.title}</div>
              <div className="text-xs text-[var(--muted)]">{k.hint}</div>
            </button>
          ))}
        </div>

        {draft.kind !== 'check' && (
          <div className="mb-4 flex gap-2.5">
            <div className="flex-1">
              <label htmlFor="habit-goal" className={label}>
                Meta por dia
              </label>
              <input
                id="habit-goal"
                type="number"
                inputMode="decimal"
                min={hours ? 0.25 : 1}
                step={hours ? 0.25 : 1}
                value={hours ? draft.goal / 60 : draft.goal}
                onChange={(e) => set({ goal: Math.round(Number(e.target.value) * (hours ? 60 : 1)) || 0 })}
                className={field}
              />
            </div>
            <div className="w-36">
              {draft.kind === 'count' ? (
                <>
                  <label htmlFor="habit-unit" className={label}>
                    Unidade
                  </label>
                  <input id="habit-unit" value={draft.unit ?? ''} onChange={(e) => set({ unit: e.target.value })} placeholder="copos" className={field} />
                </>
              ) : (
                <>
                  <span className={label}>Em</span>
                  <div className="grid h-11 grid-cols-2 overflow-hidden rounded-lg border border-[var(--border)] text-sm">
                    <button type="button" aria-pressed={!hours} className={!hours ? 'bg-amber-500/15 font-semibold' : ''} onClick={() => setInHours(false)}>
                      min
                    </button>
                    <button type="button" aria-pressed={hours} className={hours ? 'bg-amber-500/15 font-semibold' : ''} onClick={() => setInHours(true)}>
                      horas
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        <div className={label}>Dias</div>
        <div className="mb-1.5 grid grid-cols-7 gap-1.5">
          {DAYS.map(([short, full], i) => {
            const on = days.includes(i);
            return (
              <button
                key={full}
                type="button"
                aria-label={full}
                aria-pressed={on}
                onClick={() => set({ days: on ? days.filter((d) => d !== i) : [...days, i].sort() })}
                className={`h-11 rounded-full text-[13px] font-semibold ${on ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900' : 'border border-[var(--border)] text-[var(--muted)]'}`}
              >
                {short}
              </button>
            );
          })}
        </div>
        <p className="mb-3 text-xs text-[var(--muted)]">Nos outros dias a sequência não quebra.</p>
        <label className="mb-4 flex min-h-11 items-start gap-2.5 text-sm">
          <input type="checkbox" checked={!!draft.holidaysOff} onChange={(e) => set({ holidaysOff: e.target.checked })} className="mt-0.5 size-5 accent-amber-500" />
          <span>
            <span className="block font-semibold">Feriados nacionais contam como folga</span>
            <span className="block text-xs text-[var(--muted)]">Inclui Carnaval, Sexta-feira Santa e Corpus Christi. Outras folgas: toque no dia na grade.</span>
          </span>
        </label>

        {draft.kind === 'time' && (
          <>
            <div className={label}>Contar sozinho</div>
            <div className="mb-4 flex flex-col gap-2">
              {AUTOS.map((a) => (
                <button key={a.title} type="button" aria-pressed={(draft.auto ?? null) === a.id} onClick={() => set({ auto: a.id ?? undefined })} className={choice((draft.auto ?? null) === a.id)}>
                  <div className="text-sm font-semibold">{a.title}</div>
                  <div className="text-xs text-[var(--muted)]">{a.hint}</div>
                </button>
              ))}
            </div>
          </>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2">
          {habit && (
            <>
              <button
                type="button"
                className="mr-auto h-11 rounded-full px-3 text-sm text-red-600 hover:bg-[var(--app-bg)]"
                onClick={async () => {
                  if (!confirm(`Excluir "${habit.name}" e todo o histórico dele? Para só esconder, use Arquivar.`)) return;
                  await deleteHabit(habit.id);
                  onClose();
                }}
              >
                Excluir
              </button>
              <button
                type="button"
                className="h-11 rounded-full px-3 text-sm hover:bg-[var(--app-bg)]"
                onClick={async () => {
                  await archiveHabit(habit.id, !habit.archived);
                  onClose();
                }}
              >
                {habit.archived ? 'Restaurar' : 'Arquivar'}
              </button>
            </>
          )}
          <button type="submit" className="h-11 rounded-full bg-amber-500 px-5 text-sm font-semibold text-stone-900 hover:bg-amber-400">
            {habit ? 'Salvar' : 'Criar hábito'}
          </button>
        </div>
      </form>
    </div>
  );
}
