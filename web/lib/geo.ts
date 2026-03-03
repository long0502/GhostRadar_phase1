export function formatDistanceKm(fromLat: number, fromLon: number, toLat: number, toLon: number): string {
  const earthRadiusKm = 6371;
  const dLat = toRadians(toLat - fromLat);
  const dLon = toRadians(toLon - fromLon);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(fromLat)) *
      Math.cos(toRadians(toLat)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return `${(earthRadiusKm * c).toFixed(2)} km`;
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}
