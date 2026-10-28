import { useSuspenseQueries } from '@tanstack/react-query';
import { App } from 'antd';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLoaderData, useNavigate } from 'react-router-dom';
import { fieldQueries } from '../../../api/fields/fields.queries.ts';
import { mapQueries } from '../../../api/maps/maps.queries.ts';
import { useFarm } from '../../../hooks/useFarm.ts';
import type { FieldGeoJson } from '../../../types/maps/map.types.ts';
import type { FieldRouteData } from '../../../types/shared/router.types.ts';
import { getFeatureFieldId } from '../../maps/utils/mapGeometry.ts';

export function useFieldDetails() {
  const navigate = useNavigate();
  const { fieldId } = useLoaderData<FieldRouteData>();

  const [{ data: propertyData }, { data: fieldGeoJson }] = useSuspenseQueries({
    queries: [fieldQueries.properties(fieldId), mapQueries.geojson()],
  });
  const { fields, removeField, preferences, isRemovingField } = useFarm();
  const { message } = App.useApp();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const field = fields.find((item) => item.id === fieldId);
  const geojson = useMemo<FieldGeoJson>(
    () => ({
      type: 'FeatureCollection',
      features: fieldGeoJson.features.filter((feature) => getFeatureFieldId(feature) === fieldId),
    }),
    [fieldId, fieldGeoJson],
  );

  const { t } = useTranslation();
  async function handleRemove() {
    if (!field) {
      return;
    }
    try {
      await removeField(field.id);
      message.success(t('Field removed'));
      navigate('/map');
    } catch {
      message.error(t('Unable to save changes'));
    }
  }

  return {
    navigate,
    field,
    propertyData,
    preferences,
    isRemovingField,
    confirmRemove,
    setConfirmRemove,
    geojson,
    handleRemove,
  };
}
