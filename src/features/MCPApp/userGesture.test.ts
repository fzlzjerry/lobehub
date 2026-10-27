import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ACTIVATION_WINDOW_MS, createViewGestureGate } from './userGesture';

const activation = { isActive: true };
let clock = 0;

const setup = () => {
  const iframe = document.createElement('iframe');
  const other = document.createElement('button');
  document.body.append(iframe, other);
  const gate = createViewGestureGate(() => clock);

  return { gate, iframe, other };
};

describe('createViewGestureGate', () => {
  beforeEach(() => {
    clock = 1000;
    activation.isActive = true;
    Object.defineProperty(navigator, 'userActivation', { configurable: true, value: activation });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('counts a gesture once focus is in the view and the host has been idle', () => {
    const { gate, iframe } = setup();
    iframe.focus();
    clock += ACTIVATION_WINDOW_MS;

    expect(document.activeElement).toBe(iframe);
    expect(gate.hasGestureIn(iframe)).toBe(true);
    gate.dispose();
  });

  it('does not count anything right after the view mounts', () => {
    const { gate, iframe } = setup();
    iframe.focus();
    clock += ACTIVATION_WINDOW_MS - 1;

    expect(gate.hasGestureIn(iframe)).toBe(false);
    gate.dispose();
  });

  it('does not count an activation the host itself may have produced', () => {
    const { gate, iframe } = setup();
    clock += ACTIVATION_WINDOW_MS;
    window.dispatchEvent(new Event('pointerdown'));
    iframe.focus();
    clock += 1000;

    expect(gate.hasGestureIn(iframe)).toBe(false);

    clock += ACTIVATION_WINDOW_MS;
    expect(gate.hasGestureIn(iframe)).toBe(true);
    gate.dispose();
  });

  it('needs both focus in this view and a live activation', () => {
    const { gate, iframe, other } = setup();
    clock += ACTIVATION_WINDOW_MS;

    other.focus();
    expect(gate.hasGestureIn(iframe)).toBe(false);

    iframe.focus();
    activation.isActive = false;
    expect(gate.hasGestureIn(iframe)).toBe(false);
    gate.dispose();
  });

  it('stops watching host gestures once disposed', () => {
    const { gate, iframe } = setup();
    gate.dispose();
    clock += ACTIVATION_WINDOW_MS;
    window.dispatchEvent(new Event('keydown'));
    iframe.focus();

    expect(gate.hasGestureIn(iframe)).toBe(true);
  });
});
