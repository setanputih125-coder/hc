export function queueOrder(
  length: number,
  current: number,
  shuffle: boolean,
  random = Math.random,
): number[] {
  const order = Array.from({ length }, (_, index) => index);
  if (!shuffle) return order;
  const remaining = order.filter((index) => index !== current);
  for (let i = remaining.length - 1; i > 0; i--) {
    const at = Math.floor(random() * (i + 1));
    [remaining[i], remaining[at]] = [remaining[at], remaining[i]];
  }
  return length ? [current, ...remaining] : [];
}

export function nextInQueue(
  order: number[],
  current: number,
  direction: number,
  repeat: boolean,
): number | undefined {
  const at = order.indexOf(current) + direction;
  if (at >= 0 && at < order.length) return order[at];
  if (repeat && order.length) return order[(at + order.length) % order.length];
  return undefined;
}
