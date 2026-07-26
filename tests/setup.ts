// Node 26 exposes an experimental `localStorage` global. It is unavailable
// without a backing file and can shadow jsdom's implementation, so tests use
// a small browser-compatible in-memory store instead.
const values = new Map<string, string>();

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, String(value))
  } satisfies Storage
});
