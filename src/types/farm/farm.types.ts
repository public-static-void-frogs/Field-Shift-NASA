export interface FarmProfile {
  availableSeasons: string[];
  farmName: string;
  season: string;
  fullName: string;
  initials: string;
  email: string;
  role: string;
  location: string;
  locationLabel: string;
  timeZone: string;
  units: 'metric' | 'imperial';
  theme: 'light' | 'dark' | 'system';
}
