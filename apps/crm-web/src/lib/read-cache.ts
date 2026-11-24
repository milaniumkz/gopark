// Private, bounded in-memory snapshots. Reads always revalidate with the server.
export class ReadCache {
  private scope = "";
  private generation = 0;
  private values = new Map<string, { value: unknown; expires: number }>();
  private pending = new Map<string, Promise<unknown>>();
  constructor(private readonly now = Date.now, private readonly ttl = 15_000, private readonly limit = 128) {}

  private selectScope(scope: string) {
    if (scope !== this.scope) {
      this.invalidate();
      this.scope = scope;
    }
  }
  invalidate() {
    this.generation++;
    this.values.clear();
    this.pending.clear();
  }
  snapshot<T>(scope: string, path: string): T | undefined {
    this.selectScope(scope);
    const entry = this.values.get(path);
    if (!entry || entry.expires <= this.now()) {
      this.values.delete(path);
      return undefined;
    }
    return entry.value as T;
  }
  read<T>(scope: string, path: string, load: () => Promise<T>): Promise<T> {
    this.selectScope(scope);
    const existing = this.pending.get(path);
    if (existing) return existing as Promise<T>;
    const generation = this.generation;
    const request = Promise.resolve().then(load).then((value) => {
      if (generation === this.generation && scope === this.scope &&
          !/^(chats|notifications|outbox)(\/|\?|$)/.test(path) && !path.includes("next-number")) {
        const now = this.now();
        for (const [key, entry] of this.values) if (entry.expires <= now) this.values.delete(key);
        this.values.delete(path);
        this.values.set(path, { value, expires: now + this.ttl });
        while (this.values.size > this.limit) this.values.delete(this.values.keys().next().value!);
      }
      return value;
    }).finally(() => {
      if (this.pending.get(path) === request) this.pending.delete(path);
    });
    this.pending.set(path, request);
    return request;
  }
}
