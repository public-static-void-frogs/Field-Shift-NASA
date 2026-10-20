import { parcels } from './fields';
import type { HealthLevel, HealthPatch, HealthZone } from '../types/fieldHealth';

// Coordinates are relative to each parcel's bounding box. Values stay entirely local.
const healthSurfaces: Record<number, { base: number; patches: HealthPatch[] }> = {
  1: {
    base: 98,
    patches: [
      { x: 0.22, y: 0.77, radius: 0.13, score: 23 },
      { x: 0.36, y: 0.62, radius: 0.2, score: 76 },
      { x: 0.77, y: 0.25, radius: 0.24, score: 92 },
    ],
  },
  2: {
    base: 82,
    patches: [
      { x: 0.73, y: 0.72, radius: 0.26, score: 24 },
      { x: 0.5, y: 0.57, radius: 0.27, score: 54 },
      { x: 0.22, y: 0.25, radius: 0.25, score: 96 },
    ],
  },
  3: {
    base: 94,
    patches: [
      { x: 0.75, y: 0.23, radius: 0.16, score: 29 },
      { x: 0.61, y: 0.4, radius: 0.24, score: 72 },
      { x: 0.25, y: 0.73, radius: 0.24, score: 97 },
    ],
  },
  4: {
    base: 49,
    patches: [
      { x: 0.25, y: 0.75, radius: 0.34, score: 15 },
      { x: 0.49, y: 0.56, radius: 0.26, score: 32 },
      { x: 0.76, y: 0.26, radius: 0.32, score: 91 },
      { x: 0.3, y: 0.22, radius: 0.25, score: 65 },
    ],
  },
  5: {
    base: 99,
    patches: [
      { x: 0.75, y: 0.75, radius: 0.12, score: 31 },
      { x: 0.63, y: 0.61, radius: 0.19, score: 79 },
      { x: 0.25, y: 0.25, radius: 0.22, score: 95 },
    ],
  },
  6: {
    base: 92,
    patches: [
      { x: 0.24, y: 0.26, radius: 0.17, score: 27 },
      { x: 0.4, y: 0.43, radius: 0.24, score: 68 },
      { x: 0.75, y: 0.73, radius: 0.23, score: 97 },
    ],
  },
};

export const healthLevels: { label: HealthLevel; color: string; description: string }[] = [
  { label: 'Critical', color: '#ce3636', description: '0–34 · Prioritize a check' },
  { label: 'Struggling', color: '#ed8933', description: '35–54 · Needs attention' },
  { label: 'Fair', color: '#edcf45', description: '55–74 · Room to improve' },
  { label: 'Thriving', color: '#398845', description: '75–100 · Growing well' },
];

const colorStops = [
  { score: 0, rgb: [185, 35, 44] },
  { score: 30, rgb: [222, 61, 47] },
  { score: 50, rgb: [244, 152, 49] },
  { score: 65, rgb: [240, 216, 68] },
  { score: 80, rgb: [146, 188, 59] },
  { score: 100, rgb: [35, 132, 65] },
];

export function getHealthLevel(score: number): HealthLevel {
  return score < 35 ? 'Critical' : score < 55 ? 'Struggling' : score < 75 ? 'Fair' : 'Thriving';
}

export function getHealthColor(score: number): string {
  const clamped = Math.max(0, Math.min(100, score));
  const upperIndex = colorStops.findIndex(stop => stop.score >= clamped);
  const upper = colorStops[Math.max(1, upperIndex)];
  const lower = colorStops[Math.max(0, upperIndex - 1)];
  const weight = (clamped - lower.score) / (upper.score - lower.score);
  const channels = lower.rgb.map((channel, index) => Math.round(channel + (upper.rgb[index] - channel) * weight));
  return `rgb(${channels.join(',')})`;
}

export function sampleFieldHealth(fieldId: number, x: number, y: number): number {
  const surface = healthSurfaces[fieldId] ?? healthSurfaces[6];
  let score = surface.base;
  for (const patch of surface.patches) {
    const distance = Math.hypot(x - patch.x, y - patch.y);
    const influence = Math.exp(-2 * (distance / patch.radius) ** 2);
    score += (patch.score - surface.base) * influence;
  }
  return Math.round(Math.max(0, Math.min(100, score)));
}

export function getFieldGeometry(fieldId: number) {
  const parcel = parcels[fieldId - 1] ?? parcels[5];
  const vertices = parcel.points.split(' ').map(point => point.split(',').map(Number));
  const minX = Math.min(...vertices.map(([x]) => x));
  const maxX = Math.max(...vertices.map(([x]) => x));
  const minY = Math.min(...vertices.map(([, y]) => y));
  const maxY = Math.max(...vertices.map(([, y]) => y));
  return { points: parcel.points, vertices, minX, minY, width: maxX - minX, height: maxY - minY };
}

function insideParcel(x: number, y: number, vertices: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const [xi, yi] = vertices[i];
    const [xj, yj] = vertices[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function getFieldHealthMap(fieldId: number) {
  const geometry = getFieldGeometry(fieldId);
  const cells = [];
  const counts: Record<HealthLevel, number> = { Critical: 0, Struggling: 0, Fair: 0, Thriving: 0 };
  const columns = 72;
  const rows = 56;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const x = geometry.minX + column / columns * geometry.width;
      const y = geometry.minY + row / rows * geometry.height;
      const score = sampleFieldHealth(fieldId, (column + 0.5) / columns, (row + 0.5) / rows);
      cells.push({ x, y, score, color: getHealthColor(score) });
      if (insideParcel(x + geometry.width / columns / 2, y + geometry.height / rows / 2, geometry.vertices)) {
        counts[getHealthLevel(score)]++;
      }
    }
  }
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const coverage = healthLevels.map(level => ({
    ...level,
    percentage: Math.floor(counts[level.label] / total * 100),
    fraction: counts[level.label] / total,
  }));
  const remainder = 100 - coverage.reduce((sum, level) => sum + level.percentage, 0);
  const byRemainder = [...coverage].sort((a, b) => (
    (b.fraction * 100 - b.percentage) - (a.fraction * 100 - a.percentage)
  ));
  for (let index = 0; index < remainder; index++) byRemainder[index].percentage++;
  return { geometry, cells, coverage, cellWidth: geometry.width / columns, cellHeight: geometry.height / rows };
}

export function getHealthZones(fieldId: number): HealthZone[] {
  const positions = [
    { id: 'A', name: 'Northwest corner', x: 0.25, y: 0.25 },
    { id: 'B', name: 'Northeast corner', x: 0.75, y: 0.25 },
    { id: 'C', name: 'Central area', x: 0.5, y: 0.5 },
    { id: 'D', name: 'Southwest corner', x: 0.25, y: 0.75 },
    { id: 'E', name: 'Southeast corner', x: 0.75, y: 0.75 },
  ];
  return positions.map(position => {
    const score = sampleFieldHealth(fieldId, position.x, position.y);
    const level = getHealthLevel(score);
    const description = level === 'Critical' ? 'Sparse canopy and stressed growth. Prioritize a ground check for moisture and nutrient shortages.'
      : level === 'Struggling' ? 'Growth is falling behind the rest of the field. Check soil moisture and nutrient availability.'
        : level === 'Fair' ? 'The crop is established but developing unevenly. Keep an eye on canopy coverage over the next few days.'
          : 'Dense, even canopy and strong crop growth. Continue the current care routine.';
    return { ...position, score, level, description };
  });
}
