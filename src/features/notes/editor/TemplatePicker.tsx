import { useLiveQuery } from 'dexie-react-hooks';
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { db } from '../../../db/schema';
import { deleteTemplate, importTemplates, renameTemplate } from '../../../lib/notes/templates';

interface Props {
  /** The template of the page in view (null: none); undefined when that page can't have one (a PDF page). */
  current: string | null | undefined;
  onPick: (templateId: string | null) => void;
  onPickAll: () => void;
}

/** "Modelo da folha" in the paper menu: the user's templates, adding new ones from a picture or a PDF. */
export default function TemplatePicker({ current, onPick, onPickAll }: Props) {
  const templates = useLiveQuery(() => db.pageTemplates.orderBy('createdAt').toArray(), []) ?? [];
  const [busy, setBusy] = useState(false);
  const [managing, setManaging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const disabled = current === undefined;

  async function add(file: File) {
    setBusy(true);
    try {
      const [first] = await importTemplates(file);
      if (first && !disabled) onPick(first.id);
    } catch (e) {
      alert(`Não foi possível usar este arquivo como modelo: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  }

  const tile = (active: boolean) => `flex aspect-[3/4] items-center justify-center overflow-hidden rounded-md border-2 ${active ? 'border-amber-500' : 'border-[var(--border)]'}`;
  return (
    <div className={disabled ? 'opacity-50' : ''} title={disabled ? 'Páginas de PDF não usam modelo' : undefined}>
      <div className="mb-1.5 text-xs font-medium text-[var(--muted)]">Modelo da folha (esta página)</div>
      <div className="grid max-h-56 grid-cols-4 gap-1.5 overflow-y-auto">
        <button disabled={disabled} title="Sem modelo" className={`${tile(current === null)} text-[10px] text-[var(--muted)]`} onClick={() => onPick(null)}>
          Nenhum
        </button>
        {templates.map((t) =>
          managing ? (
            <div key={t.id} title={t.name} className={`${tile(false)} relative`}>
              <img src={t.thumb} alt={t.name} className="size-full object-cover object-top opacity-60" />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                <button
                  title="Renomear"
                  className="rounded-full bg-[var(--panel)] p-1 shadow"
                  onClick={() => {
                    const name = prompt('Nome do modelo', t.name)?.trim();
                    if (name) renameTemplate(t.id, name);
                  }}
                >
                  <Pencil className="size-3" />
                </button>
                <button
                  title="Apagar"
                  className="rounded-full bg-[var(--panel)] p-1 text-red-600 shadow"
                  onClick={() => {
                    if (confirm(`Apagar o modelo "${t.name}"? As páginas que o usam ficam só com o papel.`)) deleteTemplate(t.id);
                  }}
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            </div>
          ) : (
            <button key={t.id} disabled={disabled} title={t.name} className={tile(current === t.id)} onClick={() => onPick(t.id)}>
              <img src={t.thumb} alt={t.name} className="size-full object-cover object-top" />
            </button>
          ),
        )}
        <button title="Adicionar modelo (imagem ou PDF)" className={`${tile(false)} border-dashed text-[var(--muted)]`} onClick={() => input.current?.click()}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        </button>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-xs">
        {!disabled && !managing ? (
          <button className="text-left text-[var(--accent-text)] underline-offset-2 hover:underline" onClick={onPickAll}>
            Usar este modelo em todas as páginas
          </button>
        ) : (
          <span />
        )}
        {templates.length > 0 && (
          <button className="shrink-0 text-[var(--muted)] underline-offset-2 hover:underline" onClick={() => setManaging((m) => !m)}>
            {managing ? 'Pronto' : 'Editar'}
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*,application/pdf,.pdf"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) add(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}
