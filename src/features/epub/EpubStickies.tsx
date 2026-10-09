import { useLiveQuery } from 'dexie-react-hooks';
import type { Rendition } from 'epubjs';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { db, type Note } from '../../db/schema';
import { putNote } from '../../db/repo';
import { STICKY_ICON } from '../../lib/notes/sticky';
import { useHistory } from '../../store/history';
import { useUi } from '../../store/ui';
import StickyItemView from '../notes/editor/StickyItemView';
import { useReader } from '../reader/readerStore';

const CARD = { w: 210, h: 150, fontSize: 13 };

/** Where a passage is on screen, relative to `host`; null when it isn't shown (another page or chapter). */
function spotOf(rendition: Rendition, cfi: string, host: DOMRect): { x: number; y: number } | null {
  let range: Range | null = null;
  try {
    range = rendition.getRange(cfi) ?? null;
  } catch {
    return null;
  }
  const frame = range?.startContainer.ownerDocument?.defaultView?.frameElement;
  if (!range || !frame) return null;
  const r = range.getClientRects()[0] ?? range.getBoundingClientRect();
  const f = frame.getBoundingClientRect();
  const x = f.left + r.left - host.left;
  const y = f.top + r.top - host.top;
  if (!r.width && !r.height) return null;
  return x < 0 || y < 0 || x > host.width || y > host.height ? null : { x, y };
}

/**
 * Post-its in an EPUB: its text reflows, so a post-it hangs on a passage (`cfi`) as a small icon
 * in the margin beside it, and opens into a card to read and write. Placed again whenever the
 * text moves (page turns, scrolling, resizing).
 */
export default function EpubStickies({ rendition, bookId }: { rendition: Rendition; bookId: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const notes = useLiveQuery(() => db.notes.where('bookId').equals(bookId).toArray(), [bookId]);
  const stickies = (notes ?? []).filter((n): n is Note & { cfi: string } => !!n.cfi && !!n.color && !n.pin);
  const [spots, setSpots] = useState<Record<string, { x: number; y: number }>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [cardH, setCardH] = useState(CARD.h);
  const fresh = useReader((s) => s.freshStickyId);
  const fontSize = useUi((s) => s.epubFontSize);

  const place = useCallback(() => {
    const host = hostRef.current?.getBoundingClientRect();
    if (!host) return;
    const next: Record<string, { x: number; y: number }> = {};
    for (const n of stickies) {
      const spot = spotOf(rendition, n.cfi, host);
      if (spot) next[n.id] = spot;
    }
    setSpots(next);
    // stickies is rebuilt every render; what matters is which notes and where they hang.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rendition, stickies.map((n) => `${n.id}:${n.cfi}`).join()]);

  useLayoutEffect(place, [place, fontSize]);

  useEffect(() => {
    let frame = 0;
    const later = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    rendition.on('relocated', later);
    rendition.on('rendered', later);
    const close = () => setOpen(null);
    rendition.on('click', close);
    const host = hostRef.current?.parentElement;
    host?.addEventListener('scroll', later, true);
    const ro = new ResizeObserver(later);
    if (host) ro.observe(host);
    return () => {
      cancelAnimationFrame(frame);
      rendition.off('relocated', later);
      rendition.off('rendered', later);
      rendition.off('click', close);
      host?.removeEventListener('scroll', later, true);
      ro.disconnect();
    };
  }, [rendition, place]);

  // A post-it just made from a passage opens for typing.
  useEffect(() => {
    if (fresh && stickies.some((n) => n.id === fresh)) {
      setOpen(fresh);
      setCardH(CARD.h);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fresh, notes]);

  const change = (before: Note, after: Note) => useHistory.getState().commit({ added: { notes: [after] }, removed: { notes: [before] } });
  const host = hostRef.current?.getBoundingClientRect();
  const opened = stickies.find((n) => n.id === open);
  const at = opened && spots[opened.id];

  return (
    <div ref={hostRef} className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {stickies.map((n) => {
        const spot = spots[n.id];
        if (!spot) return null;
        return (
          <button
            key={n.id}
            title={n.body ? `Post-it: ${n.body.slice(0, 80)}` : 'Post-it'}
            className="pointer-events-auto absolute rounded-[2px] shadow-md ring-1 ring-black/10"
            style={{
              left: Math.max(2, spot.x - STICKY_ICON - 4),
              top: spot.y,
              width: STICKY_ICON * 0.8,
              height: STICKY_ICON * 0.8,
              background: `linear-gradient(225deg, transparent 5px, ${n.color} 5px)`,
            }}
            onClick={() => {
              setOpen(open === n.id ? null : n.id);
              setCardH(CARD.h);
            }}
          />
        );
      })}
      {opened && at && host && (
        <StickyItemView
          item={{
            x: Math.min(Math.max(4, at.x), host.width - CARD.w - 4),
            y: Math.min(at.y + STICKY_ICON, Math.max(4, host.height - cardH - 4)),
            w: CARD.w,
            h: cardH,
            color: opened.color!,
            text: opened.body,
            fontSize: CARD.fontSize,
          }}
          live
          paper
          fixed
          editing={fresh === opened.id}
          onEditEnd={() => useReader.setState({ freshStickyId: null })}
          onDrag={() => {}}
          onChange={(patch) => {
            // Folding closes the card: in an EPUB it already lives as an icon.
            if (patch.collapsed) return setOpen(null);
            if (patch.color) change(opened, { ...opened, color: patch.color, updatedAt: Date.now() });
          }}
          onText={(body) => putNote({ ...opened, body, updatedAt: Date.now() })}
          onGrow={setCardH}
          onDelete={() => {
            setOpen(null);
            useHistory.getState().commit({ added: {}, removed: { notes: [opened] } });
          }}
        />
      )}
    </div>
  );
}
