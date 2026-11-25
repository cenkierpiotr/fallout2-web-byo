export class Camera2D {
  x = 0;
  y = 0;
  zoom = 1;
  snapInteger = false;
  readonly minZoom = 0.5;
  readonly maxZoom = 4;

  effectiveZoom(): number {
    return this.snapInteger ? Math.max(1, Math.round(this.zoom)) : this.zoom;
  }

  /** Zoom dla bufora w pikselach urzadzenia: kamera jest w pikselach CSS. */
  deviceZoom(dpr: number): number {
    return this.effectiveZoom() * dpr;
  }

  setZoom(z: number): void {
    this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, z));
  }

  worldToScreen(wx: number, wy: number, viewportW: number, viewportH: number): [number, number] {
    const z = this.effectiveZoom();
    return [(wx - this.x) * z + viewportW / 2, (wy - this.y) * z + viewportH / 2];
  }

  screenToWorld(sx: number, sy: number, viewportW: number, viewportH: number): [number, number] {
    const z = this.effectiveZoom();
    return [(sx - viewportW / 2) / z + this.x, (sy - viewportH / 2) / z + this.y];
  }
}
