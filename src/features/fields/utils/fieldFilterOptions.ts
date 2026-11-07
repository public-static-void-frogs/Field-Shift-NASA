import type { TFunction } from 'i18next';
import type { CropOption } from '../../../types/fields/api.types.ts';
import type { Field } from '../../../types/fields/field.types.ts';

export function getFieldFilterOptions(cropOptions: CropOption[], fields: Field[], t: TFunction) {
  return [
    ...Array.from(
      new Set([
        ...cropOptions.map((option) => option.value),
        ...fields.flatMap((field) => (field.crop ? [field.crop] : [])),
      ]),
    ).map((value) => ({ key: `crop:${value}`, label: t('Crop: {{value0}}', { value0: value }) })),
    { key: 'moisture:low', label: t('Soil moisture: below 40%') },
    { key: 'health:low', label: t('Crop health: below 70') },
    { key: 'area:large', label: t('Area: 25 ha or more') },
  ];
}
