import { Button } from 'antd';
import { DomEvent } from 'leaflet';
import { useEffect, useRef } from 'react';
import { LassoSelect, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type MapSelectionControlsProps = {
  count: number;
  lassoActive: boolean;
  canLasso: boolean;
  onLasso: () => void;
  onClear: () => void;
};

export function MapSelectionControls({
  count,
  lassoActive,
  canLasso,
  onLasso,
  onClear,
}: MapSelectionControlsProps) {
  const { t } = useTranslation();
  const control = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = control.current;
    if (!element) {
      return;
    }
    DomEvent.disableClickPropagation(element);
    DomEvent.disableScrollPropagation(element);
    return () => {
      DomEvent.off(element);
    };
  }, []);
  let hint = t('Lasso adds visible field points. Click a point to select or unselect it.');
  if (!canLasso) {
    hint = t('Zoom in until individual field points are visible to use the lasso.');
  } else if (lassoActive) {
    hint = t('Drag a loop around field points. Press Escape to leave the lasso tool.');
  }

  return (
    <section ref={control} className="map-selection-controls" aria-label={t('Field selection')}>
      <div className="map-selection-toolbar" role="group" aria-label={t('Selection tools')}>
        <Button
          icon={<LassoSelect size={16} />}
          type={lassoActive ? 'primary' : 'default'}
          aria-pressed={lassoActive}
          disabled={!canLasso}
          onClick={onLasso}
        >
          {t('Lasso select')}
        </Button>
        <span className="map-selection-count" role="status" aria-live="polite" aria-atomic="true">
          {t('{{count}} fields selected', { count })}
        </span>
        <Button type="text" icon={<X size={14} />} disabled={count === 0} onClick={onClear}>
          {t('Clear selection')}
        </Button>
      </div>
      <p className="map-selection-hint">{hint}</p>
    </section>
  );
}
