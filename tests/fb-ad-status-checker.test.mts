import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
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
