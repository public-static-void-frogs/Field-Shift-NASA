import dayjs from 'dayjs';
import type { Field } from '../../../types/fields/field.types.ts';
import type { PlannedEvent, RotationPlan } from '../../../types/planning/planning.types.ts';
import { calculatePlantingDate } from './agronomy.mock.ts';
import { getFieldProperties } from '../../fields/mocks/properties.mock.ts';

const modelConfidence: Record<number, number> = {
  1: 91,
  2: 88,
  3: 93,
  4: 86,
  5: 92,
  6: 89,
};

export function getRotationPlan(field: Field): RotationPlan {
  const properties = getFieldProperties(field.id);
  const nextCrop =
    field.crop === 'Soybeans' ? (field.id === 3 ? 'Winter wheat' : 'Corn') : 'Soybeans';
  const followingCrop = nextCrop === 'Soybeans' ? 'Corn' : 'Soybeans';
  const planting = calculatePlantingDate(nextCrop, properties.soilPh, field.moisture);
  const followingDate = followingCrop === 'Corn' ? '2028-04-18' : '2028-04-22';
  const dateNotes = [
    `Starts with the regional ${nextCrop.toLowerCase()} planting window.`,
    planting.soilPreparationDays
      ? 'Allows 7 additional days for soil preparation following the low-pH assessment.'
      : '',
    planting.moistureReviewDays ? 'Allows 3 additional days for a moisture readiness check.' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const reasons = [
    nextCrop === 'Soybeans'
      ? `${field.crop} → soybeans introduces a legume break and lowers the next crop’s nitrogen demand.`
      : nextCrop === 'Winter wheat'
        ? 'Soybeans → winter wheat diversifies the growing season and keeps living roots in the soil over winter.'
        : 'Soybeans → corn makes use of the legume break while changing the crop family and canopy pattern.',
    field.nitrogen < 30
      ? `Available nitrogen is ${field.nitrogen} mg/kg. The plan prioritizes nutrient recovery before the next establishment.`
      : `Nitrogen at ${field.nitrogen} mg/kg and organic matter at ${properties.organicMatter.toFixed(1)}% support the planned change.`,
    properties.soilPh < 6
      ? `Soil pH is ${properties.soilPh.toFixed(1)}. A soil correction review is scheduled before planting.`
      : `Soil pH ${properties.soilPh.toFixed(1)}, moisture ${field.moisture}%, and the previous crop sequence were included in this outlook.`,
  ];
  return {
    fieldId: field.id,
    currentCrop: field.crop,
    nextCrop,
    followingCrop,
    confidence: modelConfidence[field.id] ?? 89,
    sowingDate: planting.date,
    windowEnd: planting.windowEnd,
    followingDate,
    dateExplanation: dateNotes,
    reasons,
    inputs: [
      { label: 'Available nitrogen', value: `${field.nitrogen} mg/kg` },
      { label: 'Soil moisture', value: `${field.moisture}%` },
      { label: 'Soil pH', value: properties.soilPh.toFixed(1) },
      { label: 'Organic matter', value: `${properties.organicMatter.toFixed(1)}%` },
    ],
  };
}
export function getFieldPlanEvents(field: Field): PlannedEvent[] {
  const plan = getRotationPlan(field);
  const properties = getFieldProperties(field.id);
  const prefix = `field-${field.id}`;
  const soilDate = field.status === 'Critical' ? '2026-05-25' : '2026-05-26';
  const harvestDate =
    field.crop === 'Winter wheat'
      ? '2026-07-16'
      : field.crop === 'Corn'
        ? '2026-10-10'
        : '2026-09-20';
  const seedbedDate = dayjs(plan.sowingDate).subtract(14, 'day');
  const earliestPreparation = dayjs(harvestDate).add(1, 'day');
  const events: PlannedEvent[] = [
    {
      id: `${prefix}-soil-review`,
      fieldId: field.id,
      fieldName: field.name,
      date: soilDate,
      category: 'Soil check',
      title: 'Check soil and rotation readiness',
      description: `Collect samples across ${field.name}, including the weaker growth zones. Review pH, available nutrients, and root-zone moisture before confirming the next operations.`,
      priority: field.status === 'Critical' ? 'High priority' : 'Routine',
      duration: 'Morning · 1–2 hours',
      rationale: `Current pH ${properties.soilPh.toFixed(1)}, nitrogen ${field.nitrogen} mg/kg, and moisture ${field.moisture}%.`,
    },
    {
      id: `${prefix}-inspection`,
      fieldId: field.id,
      fieldName: field.name,
      date: dayjs('2026-06-01')
        .add(field.id % 3, 'day')
        .format('YYYY-MM-DD'),
      category: 'Crop inspection',
      title: 'Review crop growth and stressed zones',
      description: `Walk the field and compare canopy development in the marked health zones. Record pest pressure and changes in the ${field.crop.toLowerCase()} crop.`,
      priority: field.health < 70 ? 'Important' : 'Routine',
      duration: 'Morning · 1 hour',
      rationale: `Follow up on the current crop health score of ${field.health}/100.`,
    },
    {
      id: `${prefix}-harvest`,
      fieldId: field.id,
      fieldName: field.name,
      date: harvestDate,
      category: 'Harvest',
      title: `Harvest ${field.crop.toLowerCase()}`,
      description: `Inspect maturity and grain moisture, then arrange harvest across ${field.area} hectares. Retain residues where practical and log the harvested yield.`,
      priority: 'Important',
      duration: 'All day · weather permitting',
      rationale: 'Expected maturity window for the current crop and growing season.',
    },
    {
      id: `${prefix}-seedbed`,
      fieldId: field.id,
      fieldName: field.name,
      date: (seedbedDate.isBefore(earliestPreparation) ? earliestPreparation : seedbedDate).format(
        'YYYY-MM-DD',
      ),
      category: 'Field preparation',
      title: `Prepare the seedbed for ${plan.nextCrop.toLowerCase()}`,
      description: `Review the latest soil results, manage residues, and prepare equipment for the transition to ${plan.nextCrop.toLowerCase()}. Confirm seed availability and the field's trafficability.`,
      priority: 'Important',
      duration: 'All day',
      rationale:
        'Scheduled after the current harvest, aiming for 14 days before the calculated planting date.',
    },
    {
      id: `${prefix}-rotation-2027`,
      fieldId: field.id,
      fieldName: field.name,
      date: plan.sowingDate,
      category: 'Crop rotation',
      title: `Plant ${plan.nextCrop.toLowerCase()} for the 2027 season`,
      description: `Rotate ${field.name} from ${field.crop.toLowerCase()} to ${plan.nextCrop.toLowerCase()}. Check soil readiness and establish the crop within the calculated ten-day planting window.`,
      priority: 'Important',
      duration: 'All day · planting window begins',
      rationale: `${plan.confidence}% model confidence. ${plan.dateExplanation}`,
    },
    {
      id: `${prefix}-rotation-2028`,
      fieldId: field.id,
      fieldName: field.name,
      date: plan.followingDate,
      category: 'Crop rotation',
      title: `Plant ${plan.followingCrop.toLowerCase()} for the 2028 season`,
      description: `Continue the proposed rotation from ${plan.nextCrop.toLowerCase()} to ${plan.followingCrop.toLowerCase()}. Review this longer-term step after the 2027 harvest and new soil results.`,
      priority: 'Routine',
      duration: 'All day · longer-term outlook',
      rationale:
        'Second step in the predicted crop sequence; reviewed as new field observations become available.',
    },
  ];
  if (field.moisture < 45) {
    events.push({
      id: `${prefix}-irrigation`,
      fieldId: field.id,
      fieldName: field.name,
      date: '2026-05-25',
      category: 'Irrigation',
      title: 'Review irrigation and root-zone moisture',
      description: `Check water distribution and inspect the driest parts of ${field.name}. Adjust the watering plan around the expected rain and record moisture after the next pass.`,
      priority: 'High priority',
      duration: 'Morning · 1 hour',
      rationale: `Current soil moisture is ${field.moisture}%, below the field’s comfortable range.`,
    });
  }
  if (field.nitrogen < 30) {
    events.push({
      id: `${prefix}-nutrition`,
      fieldId: field.id,
      fieldName: field.name,
      date: '2026-05-28',
      category: 'Nutrition',
      title: 'Review and apply the nutrient top-up',
      description:
        'Use the soil check results to confirm the nutrient plan. Arrange the planned application around the light rain window and record the applied rate.',
      priority: field.nitrogen < 20 ? 'High priority' : 'Important',
      duration: 'Morning · 2–3 hours',
      rationale: `Available nitrogen is ${field.nitrogen} mg/kg. Address the shortage before the next crop review.`,
    });
  }
  if (dayjs(plan.sowingDate).year() > 2026) {
    events.push({
      id: `${prefix}-cover-crop`,
      fieldId: field.id,
      fieldName: field.name,
      date: dayjs(harvestDate).add(14, 'day').format('YYYY-MM-DD'),
      category: 'Field preparation',
      title: 'Establish post-harvest cover',
      description:
        'Inspect harvest residues and establish a suitable winter cover where conditions allow. Protect the soil between harvest and the next main crop.',
      priority: 'Routine',
      duration: 'All day · conditions permitting',
      rationale: 'A cover period is included in the gap before the next spring planting.',
    });
  }
  return events.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}
export function getSystemPlanEvents(fields: Field[]): PlannedEvent[] {
  return fields
    .flatMap(getFieldPlanEvents)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}
