import type { FarmNotification } from '../../../types/notifications/notification.types.ts';
import { getMockFields } from '../../fields/mocks/fields.store.ts';
export function getMockNotifications(): FarmNotification[] {
  return [
    ...getMockFields()
      .filter((field) => field.status !== 'Healthy')
      .map((field): FarmNotification => ({
        id: `field-${field.id}`,
        kind: 'field',
        severity: field.status === 'Critical' ? 'error' : 'warning',
        fieldId: field.id,
        fieldName: field.name,
        title: '{{value0}} needs a little care',
        description:
          field.nitrogen < 20
            ? 'Nitrogen has dropped below the healthy range. Plan a nutrient top-up soon.'
            : 'Soil moisture is low. Check your irrigation schedule.',
      })),
    {
      id: 'weather-rain',
      kind: 'weather',
      severity: 'info',
      title: 'Light rain expected Thursday',
      description: 'A good window to plan nutrient applications.',
    },
  ];
}
