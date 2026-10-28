import { useMutation, useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { fieldMutations } from '../../../api/fields/fields.mutations.ts';

type FieldFormValues = {
  name: string;
  crop: string;
};

export function useAddField(parcelId: number) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const client = useQueryClient();
  const { mutateAsync: addField, isPending: isAddingField } = useMutation(
    fieldMutations.create(client),
  );
  async function handleAdd(values: FieldFormValues) {
    try {
      const field = await addField({ parcelId, name: values.name.trim(), crop: values.crop });
      message.success(t('{{name}} added to your farm', { name: field.name }));
      navigate(`/fields/${field.id}`);
    } catch {
      message.error(t('Unable to save changes'));
    }
  }

  return { handleAdd, isAddingField };
}
