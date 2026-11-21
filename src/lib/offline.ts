/** Drop the offline copy of her phrasebook (after deleting her data, or when the session ends). */
export function clearOfflineData(): void {
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) navigator.serviceWorker.controller?.postMessage('clear-data');
}
