/**
 * Touch-screen hygiene: stop the browser from turning game gestures into text selection,
 * long-press callouts/context menus, pinch zoom, double-tap zoom or rubber-band scrolling.
 * Form controls inside the pause menu keep their native behaviour.
 */
export function installTouchGuards(root: Document = document): () => void {
  const isFormControl = (t: EventTarget | null): boolean => t instanceof HTMLElement && !!t.closest('input, select, textarea, button, a, label');
  const block = (e: Event): void => {
    if (isFormControl(e.target)) return;
    e.preventDefault();
  };
  const blockAlways = (e: Event): void => e.preventDefault();

  // Long-press context menu (also covers iOS callout on the canvas) and text selection.
  root.addEventListener('contextmenu', block);
  root.addEventListener('selectstart', block);
  root.addEventListener('dragstart', block);
  // iOS Safari pinch-zoom gestures.
  root.addEventListener('gesturestart', blockAlways);
  root.addEventListener('gesturechange', blockAlways);
  root.addEventListener('gestureend', blockAlways);
  // Scrolling / rubber-banding / double-tap zoom: touchmove must be non-passive to be cancelable.
  const touchMove = (e: TouchEvent): void => {
    if (isFormControl(e.target)) return;
    e.preventDefault();
  };
  root.addEventListener('touchmove', touchMove, { passive: false });
  let lastTouchEnd = 0;
  const touchEnd = (e: TouchEvent): void => {
    const now = performance.now();
    if (now - lastTouchEnd < 320 && !isFormControl(e.target)) e.preventDefault(); // double-tap zoom
    lastTouchEnd = now;
  };
  root.addEventListener('touchend', touchEnd, { passive: false });
  root.addEventListener('dblclick', block);

  return () => {
    root.removeEventListener('contextmenu', block);
    root.removeEventListener('selectstart', block);
    root.removeEventListener('dragstart', block);
    root.removeEventListener('gesturestart', blockAlways);
    root.removeEventListener('gesturechange', blockAlways);
    root.removeEventListener('gestureend', blockAlways);
    root.removeEventListener('touchmove', touchMove);
    root.removeEventListener('touchend', touchEnd);
    root.removeEventListener('dblclick', block);
  };
}

interface FullscreenElementCompat extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}
interface FullscreenDocumentCompat extends Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
}

/** Fullscreen helpers with the WebKit prefix (iPadOS Safari). */
export const Fullscreen = {
  supported(): boolean {
    const el = document.documentElement as FullscreenElementCompat;
    return typeof el.requestFullscreen === 'function' || typeof el.webkitRequestFullscreen === 'function';
  },
  active(): boolean {
    const d = document as FullscreenDocumentCompat;
    return !!(d.fullscreenElement ?? d.webkitFullscreenElement);
  },
  async enter(): Promise<void> {
    const el = document.documentElement as FullscreenElementCompat;
    try {
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
      else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
    } catch {
      /* user gesture missing or denied — ignore */
    }
    // Landscape is what the on-screen controls are laid out for; best effort only.
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    if (orientation && typeof orientation.lock === 'function') orientation.lock('landscape').catch(() => undefined);
  },
  async exit(): Promise<void> {
    const d = document as FullscreenDocumentCompat;
    try {
      if (d.exitFullscreen) await d.exitFullscreen();
      else if (d.webkitExitFullscreen) await d.webkitExitFullscreen();
    } catch {
      /* ignore */
    }
  },
  async toggle(): Promise<void> {
    if (Fullscreen.active()) await Fullscreen.exit();
    else await Fullscreen.enter();
  },
};
