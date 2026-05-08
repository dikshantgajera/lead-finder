import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { __test } = require('../agent/enricher.js');

test('extractBusinessStatus detects closure states and ignores normal daily hours', () => {
  assert.equal(__test.extractBusinessStatus('Hours: Permanently closed'), 'Permanently Closed');
  assert.equal(__test.extractBusinessStatus('Temporarily closed for renovation'), 'Temporarily Closed');
  assert.equal(__test.extractBusinessStatus('Closed ⋅ Opens 9 am Mon'), '');
});

test('bestBusinessStatus prefers permanent closure over weaker statuses', () => {
  assert.equal(__test.bestBusinessStatus('Operational', 'Permanently Closed'), 'Permanently Closed');
  assert.equal(__test.bestBusinessStatus('Operational', 'Temporarily Closed'), 'Temporarily Closed');
  assert.equal(__test.bestBusinessStatus('', 'Operational'), 'Operational');
});

test('bestBusinessCategory keeps Google Maps category text and ignores panel actions', () => {
  assert.equal(__test.cleanBusinessCategory('Category: Cell phone store'), 'Cell phone store');
  assert.equal(__test.cleanBusinessCategory('Website designer'), 'Website designer');
  assert.equal(__test.cleanBusinessCategory('Directions'), '');
  assert.equal(__test.cleanBusinessCategory('4.6 stars 128 reviews'), '');
  assert.equal(__test.bestBusinessCategory(['Directions', 'Category: Restaurant', 'Open now']), 'Restaurant');
});

test('scoreSearchWebsiteCandidate prefers likely official sites and rejects directories', () => {
  const lead = {
    name: 'AKV Energy Solutions',
    website: '',
  };

  const official = __test.scoreSearchWebsiteCandidate(lead, {
    url: 'https://www.akvenergy.com/',
    title: 'AKV Energy Solutions | Solar Power Knowledge',
  });

  const directory = __test.scoreSearchWebsiteCandidate(lead, {
    url: 'https://www.tradeindia.com/akv-energy-solutions-285.html',
    title: 'AKV Energy Solutions in Surat, Gujarat, India',
  });

  assert.ok(official > 3, `expected official score > 3, got ${official}`);
  assert.equal(directory, Number.NEGATIVE_INFINITY);
});
