import { useContext } from 'react';
import { FarmContext } from '../app/FarmContext';

export function useFarm() {
  const context = useContext(FarmContext);

  if (!context) {
    throw new Error('useFarm must be used within FarmProvider');
  }

  return context;
}
