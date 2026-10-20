import dayjs from 'dayjs';
// The demo's agronomic clock is fixed to the season used throughout the app.
export const planningToday = '2026-05-24';

const plantingDates: Record<string, string> = {
  Soybeans: '2027-04-22',
  Corn: '2027-04-18',
  'Winter wheat': '2026-09-25',
};

export function calculatePlantingDate(crop: string, soilPh: number, moisture: number) {
  const soilPreparationDays = soilPh < 6 ? 7 : 0;
  const moistureReviewDays = moisture < 40 ? 3 : 0;
  const date = dayjs(plantingDates[crop] ?? plantingDates.Soybeans)
    .add(soilPreparationDays + moistureReviewDays, 'day');
  return {
    date: date.format('YYYY-MM-DD'),
    windowEnd: date.add(10, 'day').format('YYYY-MM-DD'),
    soilPreparationDays,
    moistureReviewDays,
  };
}
export function formatPlanDate(date: string): string {
  return dayjs(date).format('MMMM D, YYYY');
}
export function getEventStatus(date: string): 'Completed' | 'Due soon' | 'Planned' {
  if (date < planningToday) return 'Completed';
  return date <= dayjs(planningToday).add(7, 'day').format('YYYY-MM-DD') ? 'Due soon' : 'Planned';
}
export function isPlanDate(date?: string): boolean {
  return !!date && /^\d{4}-\d{2}-\d{2}$/.test(date) && dayjs(date).isValid() && dayjs(date).format('YYYY-MM-DD') === date;
}
