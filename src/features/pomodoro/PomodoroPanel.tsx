import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronDown, Minus, Pause, Play, Plus, SkipForward, Square, X } from 'lucide-react';
import { useState } from 'react';
import { db } from '../../db/schema';
import { dayKey, formatMinutes } from '../../lib/routine/calendar';
import { clock, phaseMs, remaining, type Phase } from '../../lib/routine/pomodoro';
import { focusesToday, pausePomodoro, resumePomodoro, skipPomodoro, startPhase, stopPomodoro, usePomodoro, type PomodoroPrefs } from '../../store/pomodoro';
import { unlockSound } from './alert';
import Ring, { PHASES } from './Ring';
import { useNow } from './useNow';

const ORDER: Phase[] = ['focus', 'short', 'long'];
const pill = 'flex h-12 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold';
const primary = `${pill} bg-amber-500 text-stone-900 hover:bg-amber-400`;
const secondary = `${pill} border border-[var(--border)] bg-[var(--app-bg)] hover:brightness-95`;

const endTime = (at: number) => new Date(at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/**
 * The pomodoro up close: the phase and its time, start, pause, skip and stop, how much focus
 * today, and its settings. A sheet from the bottom on phones.
 */
export default function PomodoroPanel() {
  const timer = usePomodoro((s) => s.timer);
  const prefs = usePomodoro((s) => s.prefs);
  const today = usePomodoro((s) => s.today);
  const now = useNow(timer.status === 'running');
  const day = dayKey(new Date(now));
  const study = useLiveQuery(() => db.activity.get(`study|${day}`), [day]);
  const [picked, setPicked] = useState<Phase | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const close = () => usePomodoro.getState().set({ panelOpen: false });

  const choosing = timer.status === 'idle' || timer.status === 'ended';
  const phase = choosing ? (picked ?? timer.phase) : timer.phase;
  const { label, color } = PHASES[phase];
  const left = choosing ? phaseMs(phase, prefs) : remaining(timer, prefs, now);
  const progress = choosing ? 0 : 1 - left / phaseMs(phase, prefs);
  const focuses = focusesToday(today, day);
  const studyMinutes = Math.floor((study?.seconds ?? 0) / 60);
  // A tap is when sound may be switched on, for the chime at the end.
  const act = (run: () => void) => () => {
    unlockSound();
    run();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center md:p-4" onClick={close}>
      <section
        aria-label="Pomodoro"
        className="max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl bg-[var(--panel)] px-4 pt-2.5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl md:max-w-sm md:rounded-2xl md:pt-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--border)] md:hidden" />
        <div className="mb-4 flex items-center gap-3">
          <h2 className="mr-auto font-serif text-xl font-bold">Pomodoro</h2>
          <button aria-label="Fechar" onClick={close} className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--app-bg)]">
            <X className="size-[18px]" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-1 rounded-full bg-[var(--app-bg)] p-1" role="radiogroup" aria-label="Etapa">
          {ORDER.map((p) => (
            <button
              key={p}
              role="radio"
              aria-checked={phase === p}
              disabled={!choosing}
              onClick={() => setPicked(p)}
              className={`h-10 rounded-full text-[13px] font-semibold ${phase === p ? 'bg-[var(--panel)] shadow' : 'text-[var(--muted)] disabled:opacity-50'}`}
            >
              {PHASES[p].label}
            </button>
          ))}
        </div>

        <div className="my-5 flex justify-center">
          <Ring size={208} width={10} progress={progress} color={color}>
            <span className={`text-5xl font-semibold tabular-nums ${timer.status === 'paused' ? 'text-[var(--muted)]' : ''}`}>{clock(left)}</span>
            <span className="mt-1 text-[13px] text-[var(--muted)]">
              {timer.status === 'running' && timer.endsAt ? `${label} · termina às ${endTime(timer.endsAt)}` : timer.status === 'paused' ? `${label} · pausado` : timer.status === 'ended' ? `${label} a seguir` : label}
            </span>
            <span className="mt-3 flex gap-1.5" aria-label={`${timer.done} de ${prefs.longEvery} focos até a pausa longa`}>
              {Array.from({ length: prefs.longEvery }, (_, i) => (
                <span key={i} className="size-2 rounded-full" style={{ background: i < timer.done ? PHASES.focus.color : 'var(--border)' }} />
              ))}
            </span>
          </Ring>
        </div>

        <div className="flex justify-center gap-2">
          {choosing && (
            <button className={`${primary} flex-1`} onClick={act(() => {
                setPicked(null);
                startPhase(phase);
              })}>
              <Play className="size-4" /> Começar {label.toLowerCase()}
            </button>
          )}
          {timer.status === 'running' && (
            <button className={`${primary} flex-1`} onClick={act(pausePomodoro)}>
              <Pause className="size-4" /> Pausar
            </button>
          )}
          {timer.status === 'paused' && (
            <button className={`${primary} flex-1`} onClick={act(resumePomodoro)}>
              <Play className="size-4" /> Continuar
            </button>
          )}
          {timer.status !== 'idle' && (
            <button className={secondary} aria-label={timer.status === 'ended' ? `Pular ${label.toLowerCase()}` : 'Pular para a próxima etapa'} title="Pular" onClick={act(skipPomodoro)}>
              <SkipForward className="size-4" />
            </button>
          )}
          {timer.status !== 'idle' && (
            <button className={secondary} aria-label="Parar" title="Parar" onClick={() => stopPomodoro()}>
              <Square className="size-4" />
            </button>
          )}
        </div>

        <p className="mt-4 text-center text-[13px] text-[var(--muted)]">
          {focuses === 1 ? '1 foco hoje' : `${focuses} focos hoje`} · {formatMinutes(studyMinutes)} de estudo hoje
        </p>

        <button
          className="mt-4 flex h-11 w-full items-center justify-between border-t border-[var(--border)] pt-1 text-sm font-semibold"
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen((o) => !o)}
        >
          Ajustes <ChevronDown className={`size-4 text-[var(--muted)] transition-transform ${settingsOpen ? 'rotate-180' : ''}`} />
        </button>
        {settingsOpen && <Settings prefs={prefs} />}
      </section>
    </div>
  );
}

function Settings({ prefs }: { prefs: PomodoroPrefs }) {
  const set = (patch: Partial<PomodoroPrefs>) => usePomodoro.getState().set({ prefs: { ...prefs, ...patch } });
  return (
    <div className="pb-1">
      <p className="mb-1 text-xs text-[var(--muted)]">O tempo de foco conta como estudo na Rotina. Mudanças valem a partir da próxima etapa.</p>
      <Stepper label="Foco" unit="min" value={prefs.focus} min={5} max={120} step={5} onChange={(focus) => set({ focus })} />
      <Stepper label="Pausa" unit="min" value={prefs.short} min={1} max={30} step={1} onChange={(short) => set({ short })} />
      <Stepper label="Pausa longa" unit="min" value={prefs.long} min={5} max={60} step={5} onChange={(long) => set({ long })} />
      <Stepper label="Pausa longa a cada" unit="focos" value={prefs.longEvery} min={2} max={8} step={1} onChange={(longEvery) => set({ longEvery })} />
      <Check label="Começar a próxima etapa sozinha" checked={prefs.autoNext} onChange={(autoNext) => set({ autoNext })} />
      <Check label="Som no fim de cada etapa" checked={prefs.sound} onChange={(sound) => set({ sound })} />
      <Check label="Vibrar no fim de cada etapa" checked={prefs.vibrate} onChange={(vibrate) => set({ vibrate })} />
      <Check label="Manter a tela acesa enquanto roda" hint="Para ouvir o fim da etapa com o tablet parado." checked={prefs.keepAwake} onChange={(keepAwake) => set({ keepAwake })} />
    </div>
  );
}

function Stepper({ label, unit, value, min, max, step, onChange }: { label: string; unit: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  const btn = 'flex size-9 items-center justify-center rounded-full bg-[var(--app-bg)] disabled:opacity-30';
  return (
    <div className="flex min-h-12 items-center gap-2 text-sm">
      <span className="mr-auto">{label}</span>
      <button className={btn} aria-label={`Menos ${label.toLowerCase()}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))}>
        <Minus className="size-4" />
      </button>
      <span className="w-16 text-center font-semibold tabular-nums">
        {value} <span className="text-xs font-normal text-[var(--muted)]">{unit}</span>
      </span>
      <button className={btn} aria-label={`Mais ${label.toLowerCase()}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))}>
        <Plus className="size-4" />
      </button>
    </div>
  );
}

function Check({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-11 items-start gap-2.5 py-1.5 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-5 accent-amber-500" />
      <span>
        <span className="block">{label}</span>
        {hint && <span className="block text-xs text-[var(--muted)]">{hint}</span>}
      </span>
    </label>
  );
}
