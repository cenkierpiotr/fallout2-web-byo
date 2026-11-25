/** Prosty packer polkowy; padding 1 px miedzy prostokatami. */
export class ShelfPacker {
  private shelfY = 0;
  private shelfH = 0;
  private cursorX = 0;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {}

  insert(w: number, h: number): { x: number; y: number } | null {
    if (w > this.width || h > this.height) return null;
    if (this.cursorX + w > this.width) {
      // nowa polka
      this.shelfY += this.shelfH + 1;
      this.shelfH = 0;
      this.cursorX = 0;
    }
    if (this.shelfY + h > this.height) return null;
    const pos = { x: this.cursorX, y: this.shelfY };
    this.cursorX += w + 1;
    if (h > this.shelfH) this.shelfH = h;
    return pos;
  }
}
