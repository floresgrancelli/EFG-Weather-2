import L from "leaflet";
import { radarRequests, RadarRequestError } from "./radar-requests";
import { tilePoint } from "./radar-provider";
import type { LayerHealth, TileIssue } from "./radar-provider";

type TileJob = { controller: AbortController; coords: L.Coords; state: "loading" | "ready" | "error" | "waiting"; issue?: TileIssue };
class LimitedRainLayer extends L.GridLayer {
  private jobs = new Map<HTMLCanvasElement, TileJob>();
  private disposed = false;
  constructor(private url: string, options: L.TileLayerOptions, private notify: (health: LayerHealth) => void) {
    super({ ...options, updateWhenIdle: true, updateWhenZooming: false, keepBuffer: 0 });
    this.on("tileunload", (event: L.TileEvent) => {
      const tile: HTMLElement = event.tile;
      if (!(tile instanceof HTMLCanvasElement)) return;
      const canvas = tile;
      this.jobs.get(canvas)?.controller.abort(); this.jobs.delete(canvas); this.publish();
    });
    this.on("remove", () => { this.disposed = true; for (const job of this.jobs.values()) job.controller.abort(); this.jobs.clear(); });
  }
  private publish() {
    if (this.disposed) return;
    const jobs = [...this.jobs.values()].filter(j => j.coords.z === this._map?.getZoom());
    const loaded = jobs.filter(j => j.state === "ready").length, failed = jobs.filter(j => j.state === "error").length;
    const waiting = jobs.find(j => j.state === "waiting"), error = jobs.find(j => j.state === "error");
    this.notify({ phase: failed ? "error" : waiting ? "waiting" : jobs.length > loaded ? "loading" : loaded ? "ready" : "idle", loaded, failed, pending: jobs.length - loaded - failed, issue: error?.issue ?? waiting?.issue });
  }
  protected override createTile(coords: L.Coords, done: L.DoneCallback): HTMLElement {
    const canvas = document.createElement("canvas");
    canvas.width = 256; canvas.height = 256; canvas.setAttribute("role", "presentation"); canvas.setAttribute("aria-hidden", "true");
    const controller = new AbortController(), job: TileJob = { controller, coords, state: "loading" };
    const url = L.Util.template(this.url, { z: coords.z, x: coords.x, y: coords.y });
    this.jobs.set(canvas, job); this.publish();
    void radarRequests.image(url, controller.signal, issue => {
      if (!controller.signal.aborted && !this.disposed) { job.state = "waiting"; job.issue = issue; this.publish(); }
    }).then(async blob => {
      if (controller.signal.aborted || this.disposed) return;
      try {
        const bitmap = await createImageBitmap(blob);
        if (controller.signal.aborted || this.disposed) { bitmap.close(); return; }
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx || bitmap.width !== 256 || bitmap.height !== 256) { bitmap.close(); throw new Error("Invalid tile size"); }
        ctx.drawImage(bitmap, 0, 0); bitmap.close();
      } catch {
        radarRequests.discard(url);
        throw new RadarRequestError({ kind: "decode" });
      }
      radarRequests.rememberVerified(url, blob);
      job.state = "ready"; job.issue = undefined; this.publish(); done(undefined, canvas);
    }).catch(error => {
      // Cancellation from pan/frame removal is not a failed current-layer request.
      if (controller.signal.aborted || this.disposed) return;
      job.state = "error"; job.issue = error instanceof RadarRequestError ? error.issue : { kind: "network" };
      this.publish(); done(new Error(`Radar tile ${job.issue.kind}`), canvas);
    });
    return canvas;
  }
  sample(latitude: number, longitude: number, zoom: number): number | null {
    const p = tilePoint(latitude, longitude, zoom);
    for (const [canvas, job] of this.jobs) {
      if (job.state === "ready" && job.coords.z === p.z && job.coords.x === p.x && job.coords.y === p.y) {
        return canvas.getContext("2d")!.getImageData(p.px, p.py, 1, 1).data[3];
      }
    }
    return null;
  }
}
export function limitedRainLayer(url: string, options: L.TileLayerOptions, notify: (health: LayerHealth) => void) {
  return new LimitedRainLayer(url, options, notify);
}
export type RainLayer = ReturnType<typeof limitedRainLayer>;
