import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { db, type ImageItem } from '../../../db/schema';

export default function ImageItemView({ item }: { item: ImageItem }) {
  const asset = useLiveQuery(() => db.noteAssets.get(item.assetId), [item.assetId]);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!asset) return;
    const u = URL.createObjectURL(asset.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [asset]);

  return (
    <div className="absolute" style={{ left: item.x, top: item.y, width: item.w, height: item.h }}>
      {url && <img src={url} alt="" draggable={false} className="size-full select-none object-fill" />}
    </div>
  );
}
