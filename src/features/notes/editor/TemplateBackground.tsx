import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { db, type NotePage } from '../../../db/schema';
import { pdfBox } from '../../../lib/notes/margins';

/** A page template's picture as a URL, while it's needed (null while loading or if deleted). */
export function useTemplateUrl(id: string | undefined) {
  const template = useLiveQuery(() => (id ? db.pageTemplates.get(id) : undefined), [id]);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!template) return setUrl(null);
    const u = URL.createObjectURL(template.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [template]);
  return url;
}

/** A page's template under it, inset by the sheet's margins like an imported PDF page. */
export default function TemplateBackground({ page, scale }: { page: NotePage; scale: number }) {
  const url = useTemplateUrl(page.background?.template);
  const box = pdfBox(page);
  if (!url) return null;
  return (
    <img
      src={url}
      alt=""
      draggable={false}
      className="pointer-events-none absolute max-w-none select-none"
      style={{ left: box.x * scale, top: box.y * scale, width: box.w * scale, height: box.h * scale }}
    />
  );
}
