import dayjs from 'dayjs';
import type { Field } from '../../../types/fields/field.types.ts';
import { planningToday } from '../../planning/mocks/agronomy.mock.ts';

import { chartColors } from '../../../features/overview/constants.ts';
// Illustrative history only; the demo has no historical sensor feed.
export function getSampleFieldTrends(fields: Field[], days: number, metric: 'health' | 'moisture') {
  return Array.from({ length: 13 }, (_, index) => {
    const sample: Record<string, string | number> = {
      date: dayjs(planningToday)
        .subtract(Math.round((days * (12 - index)) / 12), 'day')
        .locale('en')
        .format('MMM D'),
    };
    fields.forEach((field, fieldIndex) => {
      const progress = index / 12;
      const wave =
        Math.sin(index * 0.85 + fieldIndex) * (metric === 'health' ? 4 : 7) * (1 - progress);
      sample[`field-${field.id}`] = Math.max(
        0,
        Math.min(
          100,
          Math.round(field[metric] - (metric === 'health' ? 12 : 8) * (1 - progress) + wave),
        ),
      );
    });
    return sample;
  });
}

export function getCropAreas(fields: Field[]) {
  const totals = new Map<string, number>();
  fields.forEach((field) => totals.set(field.crop, (totals.get(field.crop) ?? 0) + field.area));
  return Array.from(totals, ([name, area], index) => ({
    name,
    area: Number(area.toFixed(1)),
    fill: chartColors[index % chartColors.length],
  }));
}
