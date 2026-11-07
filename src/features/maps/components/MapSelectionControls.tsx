import { Button, Tooltip } from 'antd';
import { useRef } from 'react';
import { Hand, LassoSelect } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMapControlEvents } from '../hooks/useMapControlEvents.ts';

type MapSelectionControlsProps = {
  count: number;
  lassoActive: boolean;
  canLasso: boolean;
  onLasso: () => void;
  onMove: () => void;
};

export function MapSelectionControls({
  count,
  lassoActive,
  canLasso,
  onLasso,
  onMove,
}: MapSelectionControlsProps) {
  const { t } = useTranslation();
  const control = useRef<HTMLElement>(null);
  useMapControlEvents(control);
  const selectTitle = canLasso
    ? t('Select fields')
    : t('Zoom in until individual field points are visible to use the lasso.');

  return (
    <section ref={control} className="map-selection-controls" aria-label={t('Selection tools')}>
      <Tooltip title={t('Move map')}>
        <Button
          icon={<Hand size={17} />}
          type={lassoActive ? 'text' : 'primary'}
          aria-label={t('Move map')}
          aria-pressed={!lassoActive}
          onClick={onMove}
        />
      </Tooltip>
      <Tooltip title={selectTitle}>
        <span>
          <Button
            icon={<LassoSelect size={17} />}
            type={lassoActive ? 'primary' : 'text'}
            aria-label={t('Select fields')}
            aria-pressed={lassoActive}
            disabled={!canLasso}
            onClick={onLasso}
          />
        </span>
      </Tooltip>
      <span className="map-selection-status" role="status" aria-live="polite" aria-atomic="true">
        {t('{{count}} fields selected', { count })}
      </span>
    </section>
  );
}
