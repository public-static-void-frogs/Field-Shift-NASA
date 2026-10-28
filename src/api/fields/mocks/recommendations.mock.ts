import type { Field } from '../../../types/fields/field.types.ts';

export function getRecommendation(field: Field) {
  if (field.status === 'Healthy') {
    return {
      title: 'Things are growing in the right direction.',
      description: `${field.name} is in good shape. Soil moisture and nitrogen levels are supporting steady ${field.crop.toLowerCase()} growth. Keep your current care routine and check again after Thursday’s expected rain.`,
      nextStep: 'Check crop growth and soil moisture in 3 days.',
    };
  }
  const lowNitrogen = field.nitrogen < 20;
  return {
    title:
      field.status === 'Critical'
        ? 'A little action now can make a big difference.'
        : 'Let’s give this field a little extra care.',
    description: `${field.name} is showing signs of ${lowNitrogen ? 'nitrogen deficiency' : 'moisture stress'}, which could slow your ${field.crop.toLowerCase()} growth. ${lowNitrogen ? 'Plan a nitrogen top-up within the next 48 hours, ideally before the light rain on Thursday to help nutrients reach the roots.' : 'Check your irrigation schedule and give the soil a moderate watering before the warmer days ahead.'}`,
    nextStep: lowNitrogen
      ? 'Schedule a soil check and nitrogen application.'
      : 'Check irrigation and soil moisture tomorrow.',
  };
}
