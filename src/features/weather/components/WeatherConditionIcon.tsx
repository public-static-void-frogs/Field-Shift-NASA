import type { LucideProps } from 'lucide-react';
import {
  CircleHelp,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSun,
  Snowflake,
  Sun,
} from 'lucide-react';

type WeatherConditionIconProps = LucideProps & { conditions: string };

export function WeatherConditionIcon({ conditions, ...props }: WeatherConditionIconProps) {
  if (conditions === 'Rain' || conditions === 'Drizzle') {
    return <CloudRain {...props} />;
  }
  if (conditions === 'Snow') {
    return <Snowflake {...props} />;
  }
  if (conditions === 'Fog') {
    return <CloudFog {...props} />;
  }
  if (conditions === 'Thunderstorm') {
    return <CloudLightning {...props} />;
  }
  if (conditions === 'Clear sky') {
    return <Sun {...props} />;
  }
  if (conditions === 'Partly cloudy') {
    return <CloudSun {...props} />;
  }
  if (conditions === 'Overcast') {
    return <Cloud {...props} />;
  }

  return <CircleHelp {...props} />;
}
