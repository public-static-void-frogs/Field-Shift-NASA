import type { Field } from '../../../types/fields/field.types.ts';
import type {
  CropSeason,
  CropSeasonDetails,
  LandEvent,
} from '../../../types/fields/history.types.ts';
import { getFieldProperties } from './properties.mock.ts';

const seasonSoilConditions = [
  'Residues retained; cover established',
  'Organic matter improved',
  'Baseline soil survey completed',
];
const harvestDates: Record<string, string> = { Corn: '2025-10-08', Soybeans: '2025-09-10' };
function getFieldReviewDescription(field: Field) {
  if (field.nitrogen < 20) {
    return `Low nitrogen and dry topsoil were recorded in ${field.name}. A nutrient application and irrigation review were added to the work plan.`;
  }
  if (field.status !== 'Healthy') {
    return `Drying soil was recorded in ${field.name}. Irrigation scheduling was flagged for review.`;
  }
  return `${field.name} is showing steady growth. Moisture and nutrients are supporting the current crop.`;
}

const previousCrops: Record<number, [string, string, string]> = {
  1: ['Soybeans', 'Corn', 'Winter wheat'],
  2: ['Soybeans', 'Winter wheat', 'Corn'],
  3: ['Corn', 'Soybeans', 'Winter wheat'],
  4: ['Soybeans', 'Corn', 'Winter wheat'],
  5: ['Winter wheat', 'Soybeans', 'Corn'],
  6: ['Corn', 'Winter wheat', 'Soybeans'],
};

const cropSeasonDetails: Record<string, CropSeasonDetails> = {
  'Winter wheat': {
    planted: 'September 20',
    harvested: 'July 16',
    yield: 6.8,
  },
  Corn: {
    planted: 'April 18',
    harvested: 'October 8',
    yield: 10.4,
  },
  Soybeans: {
    planted: 'April 24',
    harvested: 'September 10',
    yield: 3.6,
  },
};

export function getCropSeasons(field: Field): CropSeason[] {
  const rotation = previousCrops[field.id] ?? previousCrops[6];
  return [
    {
      year: 2026,
      crop: field.crop,
      planted: field.planted,
      harvested: 'Growing season in progress',
      yield: 'Not harvested',
      soilCondition:
        field.nitrogen < 20 ? 'Low nitrogen; nutrient review due' : 'Soil structure maintained',
    },
    ...rotation.map((crop, index) => {
      const year = 2025 - index;
      const season = cropSeasonDetails[crop];
      return {
        year,
        crop,
        planted: `${season.planted}, ${crop === 'Winter wheat' ? year - 1 : year}`,
        harvested: `${season.harvested}, ${year}`,
        yield: `${(season.yield + (field.id % 3) * 0.2 - index * 0.1).toFixed(1)} t/ha`,
        soilCondition: seasonSoilConditions[index],
      };
    }),
  ];
}
export function getLandHistory(field: Field): LandEvent[] {
  const properties = getFieldProperties(field.id);
  const seasons = getCropSeasons(field);
  const previous = seasons[1];
  const needsCare = field.status !== 'Healthy';
  const events: LandEvent[] = [
    {
      id: 'current-review',
      date: '2026-05-24',
      category: 'Soil conditions',
      title: needsCare ? 'Field health review flagged a change' : 'Field health review completed',
      description: getFieldReviewDescription(field),
      measurements: [
        `Nitrogen ${field.nitrogen} mg/kg`,
        `Moisture ${field.moisture}%`,
        `Crop health ${field.health}/100`,
      ],
      attention: needsCare,
    },
    {
      id: 'soil-sample',
      date: '2026-05-23',
      category: 'Soil conditions',
      title: 'Topsoil laboratory results received',
      description:
        'Composite samples were collected from five points at 0–30 cm depth. Results were added to the field’s soil record.',
      measurements: [
        `pH ${properties.soilPh.toFixed(1)}`,
        `Organic matter ${properties.organicMatter.toFixed(1)}%`,
        `Phosphorus ${properties.phosphorus} mg/kg`,
      ],
    },
    {
      id: 'growth-check',
      date: '2026-05-22',
      category: 'Field work',
      title: `${field.crop} growth inspection`,
      description:
        field.health < 50
          ? 'Uneven canopy and pale leaves were observed along the ridge. The affected area was marked for follow-up.'
          : 'Crop establishment and canopy coverage were checked on the morning field walk. No significant pest pressure was recorded.',
      measurements: [
        `NDVI ${properties.vegetationIndex.toFixed(2)}`,
        `Establishment ${properties.emergence}%`,
      ],
      attention: field.health < 50,
    },
    {
      id: 'recent-rain',
      date: '2026-05-18',
      category: 'Weather & water',
      title: 'Light rain replenished the topsoil',
      description:
        'An overnight shower brought moisture to the root zone. Field access resumed after the surface dried.',
      measurements: [`Rainfall ${(4.8 + field.id * 0.6).toFixed(1)} mm`, 'Air temperature 19°C'],
    },
    {
      id: 'water-review',
      date:
        properties.irrigation === 'Rain-fed'
          ? '2026-05-12'
          : new Date(properties.lastIrrigation).toLocaleDateString('en-CA'),
      category: 'Weather & water',
      title:
        properties.irrigation === 'Rain-fed'
          ? 'Water balance reviewed'
          : 'Irrigation pass completed',
      description:
        properties.irrigation === 'Rain-fed'
          ? 'Rainfall and root-zone moisture were reviewed. No supplemental watering was needed at this point.'
          : `Water was applied using the ${properties.irrigation.toLowerCase()} system. Distribution and equipment pressure were checked.`,
      measurements: [
        properties.irrigation === 'Rain-fed' ? 'Rain-fed management' : 'Application depth 14 mm',
      ],
    },
    {
      id: 'spring-soil',
      date: '2026-04-23',
      category: 'Soil conditions',
      title: 'Spring soil structure assessment',
      description:
        'Root-zone samples were assessed for compaction, drainage, and biological activity. Crop residues remained evenly distributed.',
      measurements: [
        `Bulk density ${properties.bulkDensity.toFixed(2)} g/cm³`,
        `Rooting depth ${properties.rootingDepth} cm`,
      ],
    },
    {
      id: 'nutrient-application',
      date: '2026-04-05',
      category: 'Field work',
      title: 'Spring nutrient application recorded',
      description:
        'A balanced fertilizer blend was applied. Application rates and machinery passes were logged for the growing season.',
      measurements: [`Nitrogen applied ${35 + field.id * 5} kg/ha`, 'Even spread confirmed'],
    },
    {
      id: 'winter-review',
      date: '2026-02-16',
      category: 'Soil conditions',
      title: 'Winter ground cover inspection',
      description:
        field.crop === 'Winter wheat'
          ? 'Overwintering wheat was checked after a cold spell. Ground cover helped protect the soil from wind erosion.'
          : 'Crop residues protected the surface through winter. No substantial erosion channels were found.',
      measurements: ['Soil temperature 4°C', 'Erosion risk low'],
    },
    {
      id: 'autumn-test',
      date: '2025-10-25',
      category: 'Soil conditions',
      title: 'Post-harvest soil test completed',
      description:
        'Nutrient carryover and organic matter were measured to establish a baseline for the next growing season.',
      measurements: [
        `pH ${(properties.soilPh + 0.1).toFixed(1)}`,
        `Organic matter ${(properties.organicMatter - 0.1).toFixed(1)}%`,
      ],
    },
    {
      id: 'last-harvest',
      date: harvestDates[previous.crop] ?? '2025-07-16',
      category: 'Crop rotation',
      title: `${previous.crop} harvest completed`,
      description:
        'Harvested grain was weighed and moisture tested. Residues were retained to protect the surface and return organic material to the soil.',
      measurements: [`Harvest yield ${previous.yield}`, `Area ${field.area} ha`],
    },
    {
      id: 'cover-management',
      date: '2025-07-01',
      category: 'Field work',
      title: 'Field margins and drainage inspected',
      description:
        'Grass buffer strips were maintained. Drainage outlets and the field’s access track were checked after summer showers.',
      measurements: [`Drainage: ${properties.drainage.toLowerCase()}`],
    },
    {
      id: 'previous-soil',
      date: '2025-03-19',
      category: 'Soil conditions',
      title: 'Annual soil fertility review',
      description:
        'The season’s nutrient plan was reviewed against the previous harvest and crop rotation. Soil organic matter and pH were tracked against the baseline.',
      measurements: [`Organic matter ${(properties.organicMatter - 0.2).toFixed(1)}%`],
    },
    {
      id: '2024-harvest',
      date: '2024-10-18',
      category: 'Crop rotation',
      title: `${seasons[2].crop} season closed`,
      description: `The ${seasons[2].crop.toLowerCase()} season was closed with harvest records and a soil condition assessment. A different crop was selected for the following year.`,
      measurements: [`Harvest yield ${seasons[2].yield}`],
    },
    {
      id: '2024-structure',
      date: '2024-03-20',
      category: 'Soil conditions',
      title: 'Reduced-tillage practice introduced',
      description:
        'Cultivation depth was reduced to preserve soil structure. Crop residues were left on the surface to support soil biology and moisture retention.',
      measurements: ['Cultivation depth 12 cm'],
    },
    {
      id: '2023-harvest',
      date: '2023-10-20',
      category: 'Crop rotation',
      title: `${seasons[3].crop} harvest archived`,
      description:
        'Harvest and machinery records were added to the long-term land history for future crop planning.',
      measurements: [`Harvest yield ${seasons[3].yield}`],
    },
    {
      id: 'baseline',
      date: '2023-03-14',
      category: 'Soil conditions',
      title: 'Baseline land and soil survey',
      description: `${field.name} was surveyed for soil texture, slope, and drainage. This assessment established the first reference point for long-term soil monitoring.`,
      measurements: [
        properties.soilType,
        `Slope ${properties.slope.toFixed(1)}%`,
        `Organic matter ${(properties.organicMatter - 0.4).toFixed(1)}%`,
      ],
    },
  ];
  const plantingDate = new Date(field.planted);
  events.push({
    id: 'current-planting',
    date: `${plantingDate.getFullYear()}-${String(plantingDate.getMonth() + 1).padStart(2, '0')}-${String(plantingDate.getDate()).padStart(2, '0')}`,
    category: 'Crop rotation',
    title: `${field.crop} planted for the 2026 season`,
    description: `The field transitioned from ${previous.crop.toLowerCase()} to ${field.crop.toLowerCase()}. Seedbed preparation and sowing were completed across the field.`,
    measurements: [`Planted area ${field.area} ha`, 'Reduced-tillage establishment'],
  });
  return events.sort((a, b) => b.date.localeCompare(a.date));
}
