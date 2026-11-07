import type { SVG } from 'leaflet';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Marker, Polygon } from 'react-leaflet';
import type { DetectedField } from '../../../types/maps/map.types.ts';
import { useCropIconClick } from '../hooks/useCropIconClick.ts';
import { useMapSvgRenderer } from '../hooks/useMapSvgRenderer.ts';
import { useSectionMarker } from '../hooks/useSectionMarker.ts';
import { detectedCropIcons, detectedCropColors } from '../constants/maps.constants.ts';
import type { MapSection } from '../utils/sectionSelection.ts';

type DetectedFieldsProps = {
  section: MapSection;
  onToggle: (sectionId: string, fieldId: string) => void;
};

export function DetectedFields({ section, onToggle }: DetectedFieldsProps) {
  const renderer = useMapSvgRenderer();
  const excluded = new Set(section.excludedFields ?? []);

  return (section.detectedFields ?? []).map((field, index) => (
    <DetectedRegion
      key={field.id}
      field={field}
      renderer={renderer}
      number={index + 1}
      selected={!excluded.has(field.id)}
      onToggle={() => onToggle(section.id, field.id)}
    />
  ));
}

type DetectedRegionProps = {
  renderer: SVG;
  field: DetectedField;
  number: number;
  selected: boolean;
  onToggle: () => void;
};

function DetectedRegion({ renderer, field, number, selected, onToggle }: DetectedRegionProps) {
  const { t } = useTranslation();
  const { element, icon } = useSectionMarker('crop');
  const clickHandlers = useCropIconClick(onToggle);
  const label = selected
    ? t('Deselect {{crop}} field {{number}}', { crop: field.crop, number })
    : t('Select {{crop}} field {{number}}', { crop: field.crop, number });

  return (
    <>
      <Polygon
        positions={field.geometry.coordinates.map((ring) =>
          ring.map(([longitude, latitude]) => [latitude, longitude] as [number, number]),
        )}
        pathOptions={{
          renderer,
          color: selected ? (detectedCropColors[field.crop] ?? '#80b377') : '#8c9682',
          weight: selected ? 2 : 1,
          fillColor: detectedCropColors[field.crop] ?? '#80b377',
          fillOpacity: selected ? 0.18 : 0.025,
          dashArray: selected ? undefined : '5 5',
          className: 'map-detected-boundary map-section-interactive',
        }}
        eventHandlers={{ click: onToggle }}
      />
      <Marker
        position={[field.center[1], field.center[0]]}
        icon={icon}
        keyboard={false}
        interactive={false}
      />
      {createPortal(
        <button
          type="button"
          className={`map-crop-icon ${selected ? 'is-selected' : ''}`}
          aria-label={label}
          title={label}
          aria-pressed={selected}
          {...clickHandlers}
        >
          <span aria-hidden="true">{detectedCropIcons[field.crop] ?? '🌱'}</span>
        </button>,
        element,
      )}
    </>
  );
}
