import dayjs from 'dayjs';
import type { Field } from '../../../types/fields/field.types.ts';
import type { PlanCategory } from '../../../types/planning/planning.types.ts';
import { planningToday } from './agronomy.mock.ts';
import { getFieldProperties } from '../../fields/mocks/properties.mock.ts';
import { getFieldPlanEvents, getRotationPlan } from './planning.mock.ts';

const checkpoints: Record<PlanCategory, string> = {
  'Soil check':
    'Record a new soil test and pH reading before confirming correction work. Compare representative parts of the field.',
  Irrigation:
    'Recheck root-zone moisture after the next watering or rain. Adjust the next operation to observed conditions.',
  Nutrition:
    'Use the fresh soil test to set the application plan. Record the product, rate, and application conditions.',
  'Crop inspection':
    'Record canopy development and pest observations. Escalate new stress before continuing the schedule.',
  Harvest:
    'Confirm maturity, grain moisture, and machinery readiness. Record yield and retained residues.',
  'Field preparation':
    'Check trafficability, residues, and equipment. Postpone work if the field is too wet or unworkable.',
  'Crop rotation':
    'Confirm seed availability, soil readiness, and the latest forecast. Review the next season after harvest.',
};

export function getFieldStrategy(field: Field) {
  const plan = getRotationPlan(field);
  const properties = getFieldProperties(field.id);
  const events = getFieldPlanEvents(field);
  const harvest = events.find((event) => event.category === 'Harvest')!;
  const seedbed = events.find((event) => event.id.endsWith('-seedbed'))!;
  const milestones = [
    { date: planningToday, stage: 'Current', progress: 0 },
    {
      date: dayjs(planningToday).add(21, 'day').format('YYYY-MM-DD'),
      stage: 'Soil review',
      progress: 0.2,
    },
    { date: harvest.date, stage: 'Harvest', progress: 0.35 },
    { date: seedbed.date, stage: 'Preparation', progress: 0.55 },
    { date: plan.sowingDate, stage: 'Planting', progress: 0.7 },
    {
      date: dayjs(plan.sowingDate).add(45, 'day').format('YYYY-MM-DD'),
      stage: 'Establishment',
      progress: 0.85,
    },
    { date: plan.followingDate, stage: 'Next season', progress: 1 },
  ];
  const projectedHealth = Math.min(98, Math.max(field.health + 4, 84));
  const projectedMoisture = 55;
  const forecast = milestones
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((point, index) => {
      const health = Math.round(field.health + (projectedHealth - field.health) * point.progress);
      const moisture = Math.round(
        field.moisture + (projectedMoisture - field.moisture) * point.progress,
      );
      const uncertainty = index === 0 ? 0 : 5 + index * 2;
      return {
        ...point,
        health,
        moisture,
        currentHealth: field.health,
        currentMoisture: field.moisture,
        healthImprovement: [field.health, health],
        moistureImprovement: [
          Math.min(field.moisture, moisture),
          Math.max(field.moisture, moisture),
        ],
        range: [Math.max(0, health - uncertainty), Math.min(100, health + uncertainty)],
      };
    });
  return {
    plan,
    events,
    steps: events.map((event) => ({ event, checkpoint: checkpoints[event.category] })),
    forecast,
    comparison: [
      { name: 'Crop health', current: field.health, projected: projectedHealth },
      { name: 'Soil moisture', current: field.moisture, projected: projectedMoisture },
    ],
    technicals: [
      {
        key: 'crop',
        parameter: 'Crop sequence',
        value: `${field.crop} → ${plan.nextCrop} → ${plan.followingCrop}`,
        role: 'Changes crop family and seasonal cover.',
      },
      {
        key: 'ph',
        parameter: 'Soil pH',
        value: properties.soilPh.toFixed(1),
        role:
          properties.soilPh < 6
            ? 'Adds 7 days for soil correction review.'
            : 'No pH-related delay in this draft.',
      },
      {
        key: 'moisture',
        parameter: 'Soil moisture',
        value: `${field.moisture}%`,
        role:
          field.moisture < 40
            ? 'Adds 3 days for a moisture readiness check.'
            : 'No moisture-related delay in this draft.',
      },
      {
        key: 'nitrogen',
        parameter: 'Available nitrogen',
        value: `${field.nitrogen} mg/kg`,
        role:
          field.nitrogen < 30
            ? 'A nutrient review is included in the proposed events.'
            : 'Monitor during the next soil review.',
      },
      {
        key: 'organic',
        parameter: 'Organic matter',
        value: `${properties.organicMatter.toFixed(1)}%`,
        role: 'Context for residue and soil management.',
      },
      {
        key: 'drainage',
        parameter: 'Drainage',
        value: properties.drainage,
        role: 'Check trafficability before field operations.',
      },
      {
        key: 'root',
        parameter: 'Rooting depth',
        value: `${properties.rootingDepth} cm`,
        role: 'Context for root-zone sampling and moisture checks.',
      },
    ],
    contingencies: [
      {
        condition: 'Dry conditions before planting',
        action:
          'Recheck root-zone moisture, review irrigation availability, and reassess the planting window.',
      },
      {
        condition: 'Rain or saturated soil near field work',
        action:
          'Delay machinery passes until the ground is workable; revise the preparation and planting events together.',
      },
      {
        condition: 'Soil test differs from this baseline',
        action:
          'Review the correction and nutrient plan using the new result before confirming application work.',
      },
      {
        condition: 'New crop stress or pest pressure',
        action:
          'Add an inspection and revisit the sequence before committing to the longer-term rotation.',
      },
    ],
  };
}
