import { Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import type { CropDayAssessment, WeatherUnits } from '../../../types/weather/weather.types.ts';
import { formatCropAlert } from '../utils/cropRiskPresentation.ts';
import { formatWeatherValue } from '../utils/weatherPresentation.ts';

type WeatherCropStatusProps = { assessment: CropDayAssessment | null; units: WeatherUnits };

export function WeatherCropStatus({ assessment, units }: WeatherCropStatusProps) {
  const { t } = useTranslation();
  if (!assessment) {
    return null;
  }
  const labels = {
    good: 'Good for crop',
    caution: 'Crop caution',
    high: 'High crop risk',
    unknown: 'Incomplete assessment',
  };

  return (
    <div className="weather-crop-status" data-risk={assessment.riskLevel}>
      <div className="weather-crop-status-heading">
        <strong>{t(labels[assessment.riskLevel])}</strong>
        <span>
          {t('Suitability {{score}} / 100', {
            score: formatWeatherValue(assessment.suitabilityScore),
          })}
        </span>
      </div>
      {assessment.alerts.length > 0 && (
        <ul>
          {assessment.alerts.map((alert) => (
            <li key={`${alert.metric}-${alert.reading}`} data-risk={alert.severity}>
              <span aria-hidden="true">⚠️</span> {formatCropAlert(alert, units, t)}
            </li>
          ))}
        </ul>
      )}
      {assessment.coverage !== 'complete' && (
        <Typography.Text type="secondary">
          {t('Missing readings are not assessed.')}
        </Typography.Text>
      )}
    </div>
  );
}
