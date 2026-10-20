import type { Field } from '../types/field';
import type { CropMarket, CropOffer, FinanceEstimate, OperatingCost, RotationEstimate } from '../types/finance';

export const financeRegion = 'Central Iowa';

export const financeSeason = '2026';

export const financePriceDate = 'May 24, 2026';

export const cropMarkets: CropMarket[] = [
  {
    crop: 'Winter wheat',
    change: 2.4,
    offers: [
      {
        id: 'wheat-cedar',
        buyer: 'Cedar Valley Elevator',
        distance: 18,
        price: 248,
        transport: 5,
        payment: 'Within 7 days'
      },
      {
        id: 'wheat-prairie',
        buyer: 'Prairie Grain Co.',
        distance: 42,
        price: 252,
        transport: 12,
        payment: 'Within 14 days'
      },
      {
        id: 'wheat-heartland',
        buyer: 'Heartland Milling',
        distance: 76,
        price: 260,
        transport: 22,
        payment: 'Within 7 days'
      },
    ],
  },
  {
    crop: 'Corn',
    change: -1.2,
    offers: [
      {
        id: 'corn-cedar',
        buyer: 'Cedar Valley Elevator',
        distance: 18,
        price: 188,
        transport: 3,
        payment: 'Within 7 days'
      },
      {
        id: 'corn-prairie',
        buyer: 'Prairie Grain Co.',
        distance: 42,
        price: 192,
        transport: 9,
        payment: 'Within 14 days'
      },
      {
        id: 'corn-heartland',
        buyer: 'Heartland Feed & Grain',
        distance: 64,
        price: 196,
        transport: 15,
        payment: 'Within 10 days'
      },
    ],
  },
  {
    crop: 'Soybeans',
    change: 3.1,
    offers: [
      {
        id: 'soy-prairie',
        buyer: 'Prairie Grain Co.',
        distance: 42,
        price: 441,
        transport: 8,
        payment: 'Within 14 days'
      },
      {
        id: 'soy-cedar',
        buyer: 'Cedar Valley Elevator',
        distance: 18,
        price: 435,
        transport: 12,
        payment: 'Within 7 days'
      },
      {
        id: 'soy-heartland',
        buyer: 'Heartland Oilseed',
        distance: 76,
        price: 448,
        transport: 22,
        payment: 'Within 7 days'
      },
    ],
  },
];

const cropBudgets: Record<string, { yield: number; seed: number; nutrients: number; protection: number; machinery: number; labor: number; harvest: number; }> = {
  'Winter wheat': {
    yield: 6.9,
    seed: 118,
    nutrients: 285,
    protection: 95,
    machinery: 155,
    labor: 110,
    harvest: 125
  },
  Corn: {
    yield: 10.8,
    seed: 225,
    nutrients: 340,
    protection: 124,
    machinery: 185,
    labor: 105,
    harvest: 165
  },
  Soybeans: {
    yield: 3.7,
    seed: 180,
    nutrients: 110,
    protection: 88,
    machinery: 145,
    labor: 100,
    harvest: 112
  },
};

const fieldPlans: Record<number, { crop: string; yield: number; water: number; soilCare: number; landPrice: number; }> = {
  1: {
    crop: 'Winter wheat',
    yield: 6.9,
    water: 0,
    soilCare: 60,
    landPrice: 16800
  },
  2: {
    crop: 'Corn',
    yield: 9.4,
    water: 62,
    soilCare: 75,
    landPrice: 15400
  },
  3: {
    crop: 'Soybeans',
    yield: 3.7,
    water: 0,
    soilCare: 55,
    landPrice: 18200
  },
  4: {
    crop: 'Winter wheat',
    yield: 4.6,
    water: 78,
    soilCare: 160,
    landPrice: 13200
  },
  5: {
    crop: 'Corn',
    yield: 11.8,
    water: 58,
    soilCare: 55,
    landPrice: 17600
  },
  6: {
    crop: 'Soybeans',
    yield: 3.5,
    water: 45,
    soilCare: 65,
    landPrice: 16100
  },
};

export function netCropPrice(offer: CropOffer): number {
  return offer.price - offer.transport;
}
export function getMarket(crop: string): CropMarket {
  return cropMarkets.find(market => market.crop === crop) ?? cropMarkets[0];
}
export function getBestOffer(crop: string): CropOffer {
  return [...getMarket(crop).offers].sort((a, b) => netCropPrice(b) - netCropPrice(a))[0];
}
export function getFieldFinance(field: Field): FinanceEstimate {
  const budget = cropBudgets[field.crop] ?? cropBudgets['Winter wheat'];
  const plan = fieldPlans[field.id] ?? fieldPlans[6];
  const yieldPerHectare = plan.crop === field.crop ? plan.yield : budget.yield;
  const costs: OperatingCost[] = [
    {
      key: 'seed',
      category: 'Seed & planting materials',
      perHectare: budget.seed,
      description: 'Certified seed and seed treatment'
    },
    {
      key: 'nutrients',
      category: 'Fertilizer & nutrients',
      perHectare: budget.nutrients + (field.nitrogen < 20 ? 90 : 0),
      description: field.nitrogen < 20 ? 'Seasonal nutrition plus a nitrogen recovery allowance' : 'Seasonal N, P, and K applications'
    },
    {
      key: 'protection',
      category: 'Crop protection',
      perHectare: budget.protection,
      description: 'Weed, pest, and disease management'
    },
    {
      key: 'machinery',
      category: 'Machinery & fuel',
      perHectare: budget.machinery,
      description: 'Field passes, diesel, servicing, and equipment use'
    },
    {
      key: 'labor',
      category: 'Labor & contracting',
      perHectare: budget.labor,
      description: 'Field labor and contracted operations'
    },
    {
      key: 'water',
      category: 'Irrigation & water',
      perHectare: plan.water,
      description: plan.water ? 'Water, pumping energy, and system maintenance' : 'Rain-fed field; no irrigation cost allocated'
    },
    {
      key: 'harvest',
      category: 'Harvest, drying & storage',
      perHectare: budget.harvest,
      description: 'Combining, drying, and storage before sale'
    },
    {
      key: 'soil',
      category: 'Soil care & field maintenance',
      perHectare: plan.soilCare,
      description: 'Soil testing, residue management, and drainage upkeep'
    },
    {
      key: 'insurance',
      category: 'Insurance & property charges',
      perHectare: 82,
      description: 'Allocated crop insurance and annual land charges'
    },
  ];
  const offer = getBestOffer(field.crop);
  const pricePerTonne = netCropPrice(offer);
  const production = yieldPerHectare * field.area;
  const revenue = production * pricePerTonne;
  const operatingCosts = costs.reduce((sum, cost) => sum + cost.perHectare, 0) * field.area;
  const margin = revenue - operatingCosts;
  return {
    fieldId: field.id,
    yieldPerHectare,
    production,
    offer,
    pricePerTonne,
    revenue,
    operatingCosts,
    margin,
    marginPerHectare: margin / field.area,
    marginRate: revenue ? margin / revenue * 100 : 0,
    breakEvenPrice: production ? operatingCosts / production : 0,
    breakEvenYield: pricePerTonne ? operatingCosts / field.area / pricePerTonne : 0,
    costs,
  };
}
export function getFinanceTotals(fields: Field[]) {
  const estimates = fields.map(getFieldFinance);
  const revenue = estimates.reduce((sum, estimate) => sum + estimate.revenue, 0);
  const operatingCosts = estimates.reduce((sum, estimate) => sum + estimate.operatingCosts, 0);
  const margin = revenue - operatingCosts;
  return {
    revenue,
    operatingCosts,
    margin,
    marginRate: revenue ? margin / revenue * 100 : 0
  };
}
export function getRotationEstimates(field: Field): RotationEstimate[] {
  const current = getFieldFinance(field);
  const plan = fieldPlans[field.id] ?? fieldPlans[6];
  return Object.entries(cropBudgets).map(([crop, budget]) => {
    const changingCrop = crop !== field.crop;
    const yieldPerHectare = budget.yield;
    const pricePerTonne = netCropPrice(getBestOffer(crop));
    const operatingPerHectare = budget.seed + budget.nutrients + budget.protection + budget.machinery + budget.labor + budget.harvest + plan.water + plan.soilCare + 82;
    const transitionPerHectare = changingCrop ? (crop === 'Soybeans' ? 75 : 110) : 0;
    const marginPerHectare = yieldPerHectare * pricePerTonne - operatingPerHectare - transitionPerHectare;
    return {
      crop,
      yieldPerHectare,
      pricePerTonne,
      operatingPerHectare,
      transitionPerHectare,
      marginPerHectare,
      totalMargin: marginPerHectare * field.area,
      changeFromCurrent: marginPerHectare - current.marginPerHectare,
      recommendation: !changingCrop ? 'Continue current crop' : crop === 'Soybeans' ? 'Lower nutrient demand' : crop === 'Winter wheat' ? 'Earlier harvest window' : 'Higher input investment',
    };
  }).sort((a, b) => b.marginPerHectare - a.marginPerHectare);
}
export function getLandPurchaseEstimate(field: Field) {
  const plan = fieldPlans[field.id] ?? fieldPlans[6];
  const finance = getFieldFinance(field);
  const landValue = plan.landPrice * field.area;
  const closingCosts = landValue * 0.02;
  const downPayment = landValue * 0.4;
  const loan = landValue * 0.6;
  const annualInterest = loan * 0.055;
  const cashRequired = downPayment + closingCosts;
  const annualMarginAfterInterest = finance.margin - annualInterest;
  return {
    pricePerHectare: plan.landPrice,
    landValue,
    closingCosts,
    downPayment,
    loan,
    annualInterest,
    cashRequired,
    annualMarginAfterInterest,
    cashReturnRate: cashRequired ? annualMarginAfterInterest / cashRequired * 100 : 0,
  };
}
export const procurementOffers = [
  {
    key: 'nitrogen',
    input: 'Nitrogen fertilizer',
    supplier: 'Prairie Ag Supply',
    unit: 'tonne',
    localPrice: 510,
    regionalAverage: 545,
    delivery: '3–5 days'
  },
  {
    key: 'wheat-seed',
    input: 'Certified wheat seed',
    supplier: 'Valley Seed Cooperative',
    unit: 'tonne',
    localPrice: 620,
    regionalAverage: 660,
    delivery: '5–7 days'
  },
  {
    key: 'corn-seed',
    input: 'Corn seed',
    supplier: 'Cedar Farm Inputs',
    unit: '80,000-seed bag',
    localPrice: 285,
    regionalAverage: 310,
    delivery: 'In stock'
  },
  {
    key: 'soy-seed',
    input: 'Soybean seed',
    supplier: 'Valley Seed Cooperative',
    unit: '140,000-seed bag',
    localPrice: 58,
    regionalAverage: 64,
    delivery: 'In stock'
  },
  {
    key: 'diesel',
    input: 'Farm diesel',
    supplier: 'Heartland Fuel',
    unit: 'litre',
    localPrice: 0.93,
    regionalAverage: 1.02,
    delivery: 'Next day'
  },
];

export function getFinanceInsight(field: Field) {
  if (field.id === 4 && field.crop === 'Winter wheat') {
    return {
      title: 'Restore the crop before increasing your investment.',
      description: 'Low nitrogen and moisture are holding back the yield estimate. The operating plan includes an additional nutrient allowance, but the field is still projected below break-even. Prioritize a soil check and recovery work before committing to more inputs.',
      steps: [
        'Review the nitrogen recovery allowance and irrigation timing.',
        'Compare a soybean rotation for lower nutrient demand next season.',
        'Land financing would further reduce the current operating margin.'
      ],
    };
  }
  if (field.crop === 'Corn') {
    return {
      title: 'Protect the margin by keeping input costs in focus.',
      description: 'Seed, nutrition, and machinery make up most of this field’s budget. The nearby elevator has the strongest net price after transport, even though another buyer posts a higher headline price.',
      steps: [
        'Compare seed and fertilizer purchase prices before the next order.',
        'Use the net farm-gate price when comparing buyers.',
        'Review the soybean rotation alongside the cost of switching equipment and inputs.'
      ],
    };
  }
  return {
    title: 'A healthy field gives you more room to plan.',
    description: 'The current yield outlook supports a positive operating margin. Keep soil care in the budget, compare regional buyers after haulage, and use the rotation estimate to plan the next season’s input needs.',
    steps: [
      'Prioritize the best price after transport deductions.',
      'Keep the soil-care allowance to support next season’s yield.',
      'Compare the operating return with annual interest before a land purchase.'
    ],
  };
}
