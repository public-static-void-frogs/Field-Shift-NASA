import { Alert, Button, Checkbox } from 'antd';
import { Plus, ScanLine, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMapControlEvents } from '../hooks/useMapControlEvents.ts';
import { useSectionFocus } from '../hooks/useSectionFocus.ts';
import { useSectionAnalysis, type SectionAnalysisActions } from '../hooks/useSectionAnalysis.ts';
import type { DetectedField } from '../../../types/maps/map.types.ts';
import {
  groupSectionCrops,
  includedSectionFields,
  sectionArea,
  type MapSection,
} from '../utils/sectionSelection.ts';
import { detectedCropIcons } from '../constants/maps.constants.ts';

type SectionPanelProps = {
  section: MapSection;
  onCancel: (id: string) => void;
  onSelectCrop: (sectionId: string, crop: DetectedField['crop'], included: boolean) => void;
  analysisActions: SectionAnalysisActions;
};

export function SectionPanel({
  section,
  onCancel,
  onSelectCrop,
  analysisActions,
}: SectionPanelProps) {
  const { t, i18n } = useTranslation();
  const panel = useSectionFocus(section);
  useMapControlEvents(panel);
  const { analyze } = useSectionAnalysis(section, analysisActions);
  const number = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 });
  const complete = section.analysisStatus === 'complete';
  const pending = section.analysisStatus === 'pending';
  const crops = groupSectionCrops(section);
  const included = includedSectionFields(section);
  const count = complete ? included.length : section.fields.length;
  const area = complete
    ? included.reduce((total, field) => total + field.areaHa, 0)
    : sectionArea(section);

  return (
    <aside
      ref={panel}
      className="map-section-panel map-section-interactive"
      aria-label={t('Section details')}
      aria-busy={pending}
    >
      <h2>{t('Section overview')}</h2>
      <dl className="map-section-parameters">
        <div>
          <dt>{t('Selected fields')}</dt>
          <dd>{number.format(count)}</dd>
        </div>
        <div>
          <dt>{t('Approximate area')}</dt>
          <dd>{t('About {{area}} ha', { area: number.format(area) })}</dd>
        </div>
      </dl>
      {complete && (
        <div className="map-detected-fields" aria-label={t('Crop types')}>
          {crops.map((group) => (
            <div key={group.crop} className="map-detected-field">
              <Checkbox
                checked={group.selected === group.total}
                indeterminate={group.selected > 0 && group.selected < group.total}
                aria-label={t('{{crop}}: {{selected}} of {{total}} fields selected', {
                  crop: group.crop,
                  selected: group.selected,
                  total: group.total,
                })}
                onChange={(event) => onSelectCrop(section.id, group.crop, event.target.checked)}
              >
                <span className="map-detected-crop" aria-hidden="true">
                  {detectedCropIcons[group.crop]}
                </span>
                <span className="map-detected-crop-name">{group.crop}</span>
                <span className="map-crop-group-count">
                  {group.selected}/{group.total}
                </span>
              </Checkbox>
            </div>
          ))}
        </div>
      )}
      {section.analysisError && <Alert type="error" title={section.analysisError} />}
      <div className="map-section-actions">
        {complete ? (
          <Button type="primary" block disabled={!count} icon={<Plus size={16} />}>
            {t('Add fields')}
          </Button>
        ) : (
          <Button
            type="primary"
            block
            loading={pending}
            icon={<ScanLine size={16} />}
            onClick={analyze}
          >
            {t('Analyze')}
          </Button>
        )}
        <Button block icon={<X size={16} />} onClick={() => onCancel(section.id)}>
          {t('Cancel section')}
        </Button>
      </div>
    </aside>
  );
}
