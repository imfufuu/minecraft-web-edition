/**
 * Surfaces runtime errors on screen so problems are visible without DevTools
 * (important for users testing a deployed build).
 */
let bar: HTMLDivElement | null = null;

export function showError(message: string): void {
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'error-bar';
    document.body.appendChild(bar);
  }
  bar.textContent = `⚠ ${message}`;
  console.error(message);
}

/** Hook window-level error events once. */
export function installGlobalErrorHandlers(): void {
  window.addEventListener('error', (e) => {
    showError(`Error: ${e.message} (${e.filename.split('/').pop() ?? ''}:${e.lineno})`);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r: unknown = e.reason;
    showError(`Unhandled rejection: ${r instanceof Error ? r.message : String(r)}`);
  });
}
