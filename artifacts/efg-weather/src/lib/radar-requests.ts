import type { TileIssue } from "./radar-provider";

export class RadarRequestError extends Error {
  public issue: TileIssue;
  constructor(issue: TileIssue) { super(`Radar request: ${issue.kind}${issue.status ? ` ${issue.status}` : ""}`); this.issue = issue; }
}
// Shared by coverage and precipitation. Cache hits do NOT consume network slots.
// This cannot control other tabs/devices behind the same provider-visible public IP.
export class RadarRequests {
  private starts: number[] = [];
  private active = 0;
  private blockedUntil = 0;
  private queue: { run: () => void; signal: AbortSignal; wait: (issue: TileIssue) => void }[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private cache = new Map<string, Blob>();
  private reload = new Set<string>();
  private transport: typeof fetch;
  private clock: () => number;
  private budget: number;
  constructor(transport: typeof fetch = fetch, clock = () => Date.now(), budget = 80) { this.transport = transport; this.clock = clock; this.budget = budget; }
  async image(url: string, signal: AbortSignal, waiting: (issue: TileIssue) => void): Promise<Blob> {
    signal.throwIfAborted();
    const cached = this.cache.get(url);
    if (cached) { this.cache.delete(url); this.cache.set(url, cached); return cached; }
    return new Promise((resolve, reject) => {
      const job = {
        signal, wait: waiting,
        run: () => {
          signal.removeEventListener("abort", cancel);
          this.active++; this.starts.push(this.clock());
          void this.download(url, signal).then(resolve, reject).finally(() => { this.active--; this.pump(); });
        },
      };
      const cancel = () => {
        this.queue = this.queue.filter(j => j !== job);
        reject(signal.reason ?? new DOMException("Aborted", "AbortError")); this.pump();
      };
      signal.addEventListener("abort", cancel, { once: true });
      this.queue.push(job); this.pump();
    });
  }
  private pump() {
    clearTimeout(this.timer); this.timer = undefined;
    const now = this.clock();
    this.starts = this.starts.filter(t => now - t < 60000);
    while (this.queue.length && this.active < 2) {
      const retryAt = Math.max(this.blockedUntil, this.starts.length >= this.budget ? this.starts[0] + 60001 : 0);
      if (retryAt > now) {
        for (const job of this.queue) job.wait({ kind: "rate-limit", local: this.blockedUntil <= now, retryAt });
        this.timer = setTimeout(() => this.pump(), Math.min(60000, Math.max(1, retryAt - now))); return;
      }
      const job = this.queue.shift()!;
      if (!job.signal.aborted) job.run();
    }
  }
  private async download(url: string, signal: AbortSignal) {
    const timeout = AbortSignal.timeout(15000);
    try {
      const send = this.transport;
      const response = await send(url, { signal: AbortSignal.any([signal, timeout]), credentials: "omit", referrerPolicy: "no-referrer", mode: "cors", cache: this.reload.has(url) ? "reload" : "default" });
      if (response.status === 429) {
        const after = response.headers.get("retry-after");
        const parsed = after && /^\d+$/.test(after) ? this.clock() + Number(after) * 1000 : after ? Date.parse(after) : NaN;
        this.blockedUntil = Math.max(this.blockedUntil, Number.isFinite(parsed) && parsed > this.clock() ? parsed : this.clock() + 60000);
        throw new RadarRequestError({ kind: "rate-limit", status: 429, retryAt: this.blockedUntil });
      }
      if (!response.ok) throw new RadarRequestError({ kind: "http", status: response.status });
      if (!(response.headers.get("content-type") || "").toLowerCase().startsWith("image/png")) throw new RadarRequestError({ kind: "decode" });
      const blob = await response.blob();
      signal.throwIfAborted();
      if (!blob.size || blob.size > 1024 * 1024) throw new RadarRequestError({ kind: "decode" });
      return blob;
    } catch (error) {
      if (!signal.aborted) this.discard(url);
      if (signal.aborted || error instanceof RadarRequestError) throw error;
      throw new RadarRequestError({ kind: timeout.aborted ? "timeout" : "network" });
    }
  }
  rememberVerified(url: string, blob: Blob) {
    this.cache.set(url, blob); this.reload.delete(url);
    while (this.cache.size > 64) this.cache.delete(this.cache.keys().next().value!);
  }
  discard(url: string) {
    this.cache.delete(url); this.reload.add(url);
    while (this.reload.size > 64) this.reload.delete(this.reload.values().next().value!);
  }
}
export const radarRequests = new RadarRequests();
