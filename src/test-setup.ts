// @ts-expect-error Node built-in; the app's types are browser-only on purpose.
import { Blob as NodeBlob } from 'node:buffer';
import 'fake-indexeddb/auto';

// jsdom's Blob can't be structured-cloned into fake-indexeddb (browsers' IndexedDB stores Blobs
// natively); Node's can, and has the same API.
globalThis.Blob = NodeBlob as unknown as typeof Blob;
