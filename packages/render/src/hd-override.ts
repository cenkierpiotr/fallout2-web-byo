import type { ObjectFrame } from './object-layer.js';

/** Metryki klatki w jednostkach swiata (tekstury HD sa rysowane tak samo duze jak oryginal). */
export interface WorldMetrics {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  shiftX: number;
  shiftY: number;
}

export function worldMetrics(f: ObjectFrame): WorldMetrics {
  const k = f.scale && f.scale > 0 ? f.scale : 1;
  return {
    width: f.width / k,
    height: f.height / k,
    offsetX: f.offsetX / k,
    offsetY: f.offsetY / k,
    shiftX: f.shiftX / k,
    shiftY: f.shiftY / k,
  };
}
