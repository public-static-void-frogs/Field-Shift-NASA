export interface CropOffer {
  id: string;
  buyer: string;
  distance: number;
  price: number;
  transport: number;
  payment: string;
}
export interface CropMarket {
  crop: string;
  change: number;
  offers: CropOffer[];
}
export interface OperatingCost {
  key: string;
  category: string;
  perHectare: number;
  description: string;
}
export interface FinanceEstimate {
  fieldId: number;
  yieldPerHectare: number;
  production: number;
  offer: CropOffer;
  pricePerTonne: number;
  revenue: number;
  operatingCosts: number;
  margin: number;
  marginPerHectare: number;
  marginRate: number;
  breakEvenPrice: number;
  breakEvenYield: number;
  costs: OperatingCost[];
}
export interface RotationEstimate {
  crop: string;
  yieldPerHectare: number;
  pricePerTonne: number;
  operatingPerHectare: number;
  transitionPerHectare: number;
  marginPerHectare: number;
  totalMargin: number;
  changeFromCurrent: number;
  recommendation: string;
}
