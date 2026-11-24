/** When a touch on Home counts as "swipe right to open your profile". Pure, so it's tested. */

export type SwipeStart = { x: number; y: number; blocked: boolean };

/** Android's back gesture owns the screen edges; swipes starting this close to one are left alone. */
export const EDGE = 28;
/** How far right, at least, and how much more sideways than up or down. */
export const MIN_DISTANCE = 70;

export function isOpenSwipe(start: SwipeStart, end: { x: number; y: number }, width: number): boolean {
  if (start.blocked) return false;
  if (start.x < EDGE || start.x > width - EDGE) return false;
  const dx = end.x - start.x;
  const dy = Math.abs(end.y - start.y);
  return dx >= MIN_DISTANCE && dx > dy * 2;
}
