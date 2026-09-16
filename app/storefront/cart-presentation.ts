export const cartChangedEventName = "figmemento:cart-changed";

/** Notify presentation surfaces that a Cart mutation has already succeeded. */
export function notifyCartChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(cartChangedEventName));
}
