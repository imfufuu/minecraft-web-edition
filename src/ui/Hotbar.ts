import { getBlockDef, HOTBAR_BLOCKS } from '../blocks/BlockRegistry';
import type { BlockId } from '../blocks/BlockTypes';
import type { InputManager } from '../core/InputManager';
import type { TextureAtlas } from '../mesh/TextureAtlas';

/**
 * Bottom-centre 9-slot hotbar. Keys 1–9, mouse wheel, or tapping a slot select a block.
 * Thumbnails are drawn from the procedural atlas (side tile for blocks with distinct sides).
 */
export class Hotbar {
  private readonly el: HTMLDivElement;
  private readonly slots: HTMLDivElement[] = [];
  private readonly input: InputManager;
  private selected = 0;
  private readonly listeners: ((id: BlockId, index: number) => void)[] = [];

  constructor(input: InputManager, atlas: TextureAtlas, parent: HTMLElement = document.body) {
    this.input = input;
    this.el = document.createElement('div');
    this.el.className = 'hotbar';

    HOTBAR_BLOCKS.forEach((id, i) => {
      const slot = document.createElement('div');
      slot.className = 'hotbar-slot';
      slot.title = getBlockDef(id).name;
      const icon = document.createElement('canvas');
      icon.width = 32;
      icon.height = 32;
      icon.className = 'hotbar-icon';
      atlas.drawTile(getBlockDef(id).side, icon);
      const num = document.createElement('span');
      num.className = 'hotbar-num';
      num.textContent = String(i + 1);
      slot.append(icon, num);
      slot.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.select(i);
      });
      this.el.appendChild(slot);
      this.slots.push(slot);
    });
    parent.appendChild(this.el);

    input.onKeyPress((code) => {
      if (code.startsWith('Digit')) {
        const n = Number(code.slice(5));
        if (n >= 1 && n <= HOTBAR_BLOCKS.length) this.select(n - 1);
      }
    });

    this.select(0);
  }

  /** Poll the wheel once per frame. */
  update(): void {
    const w = this.input.consumeWheel();
    if (w !== 0) this.select((this.selected + w + HOTBAR_BLOCKS.length) % HOTBAR_BLOCKS.length);
  }

  get selectedBlock(): BlockId {
    return HOTBAR_BLOCKS[this.selected];
  }

  get selectedIndex(): number {
    return this.selected;
  }

  select(index: number): void {
    this.selected = index;
    this.slots.forEach((s, i) => s.classList.toggle('selected', i === index));
    for (const fn of this.listeners) fn(this.selectedBlock, index);
  }

  onSelect(fn: (id: BlockId, index: number) => void): void {
    this.listeners.push(fn);
  }

  dispose(): void {
    this.el.remove();
  }
}
