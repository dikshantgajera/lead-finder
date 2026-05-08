import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  buildFinalListWithCompetitors,
  buildAdsLibraryUrl,
  parseAdsLibraryContent,
} = require("../scripts/check-fb-page-ads.js");

test("buildAdsLibraryUrl uses the Lead-generator Ads Library page-id parameters", () => {
  const url = new URL(buildAdsLibraryUrl("1820291604710457", "ALL"));

  assert.equal(url.origin + url.pathname, "https://www.facebook.com/ads/library/");
  assert.equal(url.searchParams.get("active_status"), "active");
  assert.equal(url.searchParams.get("ad_type"), "all");
  assert.equal(url.searchParams.get("country"), "ALL");
  assert.equal(url.searchParams.get("is_targeted_country"), "false");
  assert.equal(url.searchParams.get("media_type"), "all");
  assert.equal(url.searchParams.get("search_type"), "page");
  assert.equal(url.searchParams.get("sort_data[direction]"), "desc");
  assert.equal(url.searchParams.get("sort_data[mode]"), "total_impressions");
  assert.equal(url.searchParams.get("view_all_page_id"), "1820291604710457");
});

test("parseAdsLibraryContent classifies running ads from result count and library ids", () => {
  const parsed = parseAdsLibraryContent(`
    Meta Ad Library
    ~190 results
    Active
    Library ID: 1691282745208774
  `);

  assert.equal(parsed.ads_status, "running_ads");
  assert.equal(parsed.running_ads, true);
  assert.equal(parsed.ads_found_count, 190);
  assert.deepEqual(parsed.evidence.library_ids_sample, ["1691282745208774"]);
});

test("parseAdsLibraryContent classifies no-results pages as not running", () => {
  const parsed = parseAdsLibraryContent("Meta Ad Library No results Filters");

  assert.equal(parsed.ads_status, "not_running_ads");
  assert.equal(parsed.running_ads, false);
  assert.equal(parsed.ads_found_count, 0);
});

test("parseAdsLibraryContent stores unclassified loaded pages as not running", () => {
  const parsed = parseAdsLibraryContent("Meta Ad Library Filters Sort Active status: Active ads");

  assert.equal(parsed.ads_status, "not_running_ads");
  assert.equal(parsed.running_ads, false);
  assert.equal(parsed.ads_found_count, 0);
  assert.match(parsed.warning, /No active ad result count/);
});

test("saved ad-status final list attaches two running competitors from the same category", () => {
  const leads = [
    {
      name: "No Ads Cafe",
      category: "Cafe",
      phone: "111",
      address_full: "12 Market Road, Indiranagar, Bengaluru, Karnataka 560038, India",
      website: "https://noads.example",
      facebook_page_id: "100",
    },
    {
      name: "Running Cafe One",
      category: "Cafe",
      phone: "222",
      address_full: "18 Market Road, Indiranagar, Bengaluru, Karnataka 560038, India",
      website: "https://running-one.example",
      facebook_page_id: "200",
    },
    {
      name: "Running Salon",
      category: "Salon",
      phone: "333",
      address_full: "16 Market Road, Indiranagar, Bengaluru, Karnataka 560038, India",
      website: "https://running-salon.example",
      facebook_page_id: "300",
    },
    {
      name: "Running Cafe Two",
      category: "Cafe",
      phone: "444",
      address_full: "20 Market Road, Indiranagar, Bengaluru, Karnataka 560038, India",
      website: "https://running-two.example",
      facebook_page_id: "400",
    },
  ];
  const adResults = [
    { source_index: 0, company: { name: "No Ads Cafe" }, ads_status: "not_running_ads", running_ads: false, ads_found_count: 0 },
    { source_index: 1, company: { name: "Running Cafe One" }, ads_status: "running_ads", running_ads: true, ads_found_count: 5 },
    { source_index: 2, company: { name: "Running Salon" }, ads_status: "running_ads", running_ads: true, ads_found_count: 8 },
    { source_index: 3, company: { name: "Running Cafe Two" }, ads_status: "running_ads", running_ads: true, ads_found_count: 3 },
  ];

  const finalList = buildFinalListWithCompetitors(leads, adResults);

  assert.equal(finalList.length, 1);
  assert.deepEqual(finalList[0].competitors.map((competitor: any) => competitor.name), [
    "Running Cafe One",
    "Running Cafe Two",
  ]);
  assert.equal(finalList[0].competitors.some((competitor: any) => competitor.name === "Running Salon"), false);
});
