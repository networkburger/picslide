// Android vibrates; iOS/iPadOS ignore this silently.
const vibrate = (pattern: number | number[]) => {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
};

export const haptics = {
  tap: () => vibrate(8),
  lift: () => vibrate(12),
  drop: () => vibrate(18),
  correct: () => vibrate([20, 40, 30]),
  win: () => vibrate([30, 60, 30, 60, 80]),
};
