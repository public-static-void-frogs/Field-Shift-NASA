import assert from 'node:assert/strict';
import test from 'node:test';
import { initialFields } from '../src/data/fields.ts';
import {
  getBestOffer,
  getFieldFinance,
  getFinanceTotals,
  getLandPurchaseEstimate,
  getRotationEstimates,
  netCropPrice,
} from '../src/data/finance.ts';

function closeTo(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 0.00001, `${actual} should equal ${expected}`);
}

test('best buyer is selected after haulage, rather than by headline price', () => {
  const wheat = getBestOffer('Winter wheat');
  assert.equal(wheat.buyer, 'Cedar Valley Elevator');
  assert.equal(netCropPrice(wheat), 243);
  assert.equal(netCropPrice(getBestOffer('Soybeans')), 433);
});

test('whole-farm revenue, costs, and margin reconcile to the field budgets', () => {
  const totals = getFinanceTotals(initialFields);
  closeTo(totals.revenue, 205015.5);
  closeTo(totals.operatingCosts, 137751);
  closeTo(totals.margin, 67264.5);
  closeTo(getFinanceTotals([initialFields[0]]).margin, 16038.16);
});

test('a field below break-even retains its negative margin', () => {
  const eastRidge = getFieldFinance(initialFields[3]);
  closeTo(eastRidge.marginPerHectare, -180.2);
  closeTo(eastRidge.margin, -2955.28);
  assert.ok(eastRidge.breakEvenPrice > eastRidge.pricePerTonne);
  assert.ok(eastRidge.breakEvenYield > eastRidge.yieldPerHectare);
});

test('rotation margin includes the switching allowance exactly once', () => {
  const rotations = getRotationEstimates(initialFields[3]);
  const soybeans = rotations.find(option => option.crop === 'Soybeans');
  assert.equal(soybeans.transitionPerHectare, 75);
  closeTo(soybeans.marginPerHectare, 472.1);
  closeTo(soybeans.totalMargin, 7742.44);
  assert.equal(rotations.find(option => option.crop === 'Winter wheat').transitionPerHectare, 0);
});

test('land purchase separates acquisition cash, interest, and operating margin', () => {
  const purchase = getLandPurchaseEstimate(initialFields[0]);
  closeTo(purchase.cashRequired, 174988.8);
  closeTo(purchase.annualInterest, 13749.12);
  closeTo(purchase.annualMarginAfterInterest, 2289.04);
  assert.ok(getLandPurchaseEstimate(initialFields[3]).annualMarginAfterInterest < 0);
});

test('empty selections return zero totals without invalid percentages', () => {
  assert.deepEqual(getFinanceTotals([]), {
    revenue: 0, operatingCosts: 0, margin: 0, marginRate: 0,
  });
});

test('re-added parcels with a different crop use the new crop budget and price', () => {
  const field = { ...initialFields[0], crop: 'Soybeans' };
  const estimate = getFieldFinance(field);
  assert.equal(estimate.yieldPerHectare, 3.7);
  assert.equal(estimate.pricePerTonne, 433);
  assert.equal(estimate.costs.find(cost => cost.key === 'seed').perHectare, 180);
});
