import { beforeEach, describe, expect, it } from 'vitest';
import { db, type Stroke } from '../db/schema';
import { useHistory } from './history';

const stroke = (id: string): Stroke => ({ id, bookId: 'b', page: 1, tool: 'pen', color: '#000', width: 2, points: [[0, 0, 0.5]], createdAt: 0 });

describe('history', () => {
  beforeEach(async () => {
    await db.strokes.clear();
    useHistory.getState().reset();
  });

  it('undoes and redoes additions and removals', async () => {
    const h = useHistory.getState();
    await h.commit({ added: { strokes: [stroke('a'), stroke('b')] }, removed: {} });
    await h.commit({ added: {}, removed: { strokes: [stroke('a')] } });
    expect((await db.strokes.toArray()).map((s) => s.id)).toEqual(['b']);

    await useHistory.getState().undo();
    expect((await db.strokes.toArray()).map((s) => s.id).sort()).toEqual(['a', 'b']);
    await useHistory.getState().undo();
    expect(await db.strokes.count()).toBe(0);

    await useHistory.getState().redo();
    expect(await db.strokes.count()).toBe(2);
    expect(useHistory.getState().redoStack).toHaveLength(1);

    await useHistory.getState().commit({ added: { strokes: [stroke('c')] }, removed: {} });
    expect(useHistory.getState().redoStack).toHaveLength(0);
  });
});
