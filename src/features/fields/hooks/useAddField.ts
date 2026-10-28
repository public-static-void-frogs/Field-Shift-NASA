import { useSuspenseQueries } from '@tanstack/react-query';
import { App } from 'antd';
import { useTranslation } from 'react-i18next';
import { useLoaderData, useNavigate } from 'react-router-dom';
import { fieldQueries } from '../../../api/fields/fields.queries.ts';
import { useFarm } from '../../../hooks/useFarm.ts';
import type { FieldFormValues } from '../../../types/fields/api.types.ts';
import type { ParcelRouteData } from '../../../types/shared/router.types.ts';

export function useAddField() {
  const navigate = useNavigate();
  const { parcelId } = useLoaderData<ParcelRouteData>();
  const { t } = useTranslation();
  const { fields, addField, isAddingField, preferences } = useFarm();
  const [{ data: parcel }, { data: cropOptions }] = useSuspenseQueries({
    queries: [fieldQueries.parcel(parcelId), fieldQueries.crops()],
  });
  const { message } = App.useApp();
  const exists = fields.some((field) => field.id === parcelId);
  async function handleAdd(values: FieldFormValues) {
    try {
      const field = await addField({ parcelId, name: values.name.trim(), crop: values.crop });
      message.success(t('{{name}} added to your farm', { name: field.name }));
      navigate(`/fields/${field.id}`);
    } catch {
      message.error(t('Unable to save changes'));
    }
  }

  return { parcelId, parcel, cropOptions, isAddingField, preferences, exists, handleAdd };
}
