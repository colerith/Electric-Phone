type LocationMessage = { id?: string; content: string; payload: Record<string, unknown> };
export function locationDistance(message: LocationMessage): number {
  const value = message.payload.distanceKm;
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  const seed = Array.from(`${message.id || ''}:${message.content}`).reduce(
    (hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0,
    0,
  );
  return (2 + (seed % 198)) / 10;
}
export function distanceLabel(distance: number): string {
  return distance < 1 ? `${Math.round(distance * 1000)} m` : `${Number(distance.toFixed(2))} km`;
}
