export type Position = [number, number];
export type Boundary = { type: 'Polygon'; coordinates: Position[][] } | { type: 'MultiPolygon'; coordinates: Position[][][] };

export function isBoundary(value: unknown): value is Boundary {
  if (!value || typeof value !== 'object' || !('type' in value) || !('coordinates' in value)) return false;
  const position = (p: unknown): p is Position => Array.isArray(p) && p.length >= 2 && typeof p[0] === 'number' && typeof p[1] === 'number' && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;
  const ring = (r: unknown) => Array.isArray(r) && r.length >= 4 && r.every(position) && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1];
  const polygon = (p: unknown) => Array.isArray(p) && p.length > 0 && p.every(ring);
  return value.type === 'Polygon' ? polygon(value.coordinates) : value.type === 'MultiPolygon' && Array.isArray(value.coordinates) && value.coordinates.length > 0 && value.coordinates.every(polygon);
}

// Boundary points are included; holes are excluded. GeoJSON coordinates are lon, lat.
function inRing([x, y]: Position, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const cross = (x - xi) * (yj - yi) - (y - yi) * (xj - xi);
    if (Math.abs(cross) < 1e-10 && x >= Math.min(xi, xj) && x <= Math.max(xi, xj) && y >= Math.min(yi, yj) && y <= Math.max(yi, yj)) return true;
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function containsPoint(boundary: Boundary, lon: number, lat: number): boolean {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return false;
  const polygons = boundary.type === 'Polygon' ? [boundary.coordinates] : boundary.coordinates;
  return polygons.some(([outer, ...holes]) => inRing([lon, lat], outer) && !holes.some(hole => inRing([lon, lat], hole)));
}

export function boundaryBox(boundary: Boundary): [number, number, number, number] {
  const polygons = boundary.type === 'Polygon' ? [boundary.coordinates] : boundary.coordinates;
  let south = 90, north = -90, west = 180, east = -180;
  for (const polygon of polygons) for (const ring of polygon) for (const [lon, lat] of ring) {
    south = Math.min(south, lat); north = Math.max(north, lat);
    west = Math.min(west, lon); east = Math.max(east, lon);
  }
  return [south, north, west, east];
}
