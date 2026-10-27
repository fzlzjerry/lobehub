/** How long one gesture keeps the page's transient user activation (Chrome and Firefox: 5 s). */
export const ACTIVATION_WINDOW_MS = 5000;

const HOST_GESTURES = ['keydown', 'pointerdown', 'pointerup'] as const;

/**
 * Tells whether the user just acted inside one view. A click or key press in
 * the sandboxed iframe never reaches the host as an event. The host only sees
 * that the page has transient activation and that focus is in the frame, and
 * neither proves a gesture in the view: a view can focus itself, and the
 * activation may come from the host's own UI, such as the click that opened
 * the topic. So the host also requires that it saw no gesture of its own for
 * as long as an activation lasts, counting from when the gate was created.
 */
export const createViewGestureGate = (now: () => number = () => performance.now()) => {
  // Host gestures from before the gate existed went unseen: assume one just happened
  let lastHostGestureAt = now();
  const record = () => {
    lastHostGestureAt = now();
  };
  for (const type of HOST_GESTURES) window.addEventListener(type, record, true);

  return {
    dispose: () => {
      for (const type of HOST_GESTURES) window.removeEventListener(type, record, true);
    },
    hasGestureIn: (iframe: HTMLIFrameElement) =>
      document.activeElement === iframe &&
      navigator.userActivation?.isActive === true &&
      now() - lastHostGestureAt >= ACTIVATION_WINDOW_MS,
  };
};
