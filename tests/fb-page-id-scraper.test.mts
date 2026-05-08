import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { __test } = require("../agent/fb_page_id_scraper.js");

test("extractPageTransparencyPageIdFromText reads screenshot-style Page transparency layout", () => {
  const text = [
    "Page transparency",
    "Facebook is showing information to help you understand the purpose of this Page.",
    "1820291604710457",
    "Page ID",
    "30 January 2018",
    "Creation date",
  ].join("\n");

  assert.equal(__test.extractPageTransparencyPageIdFromText(text), "1820291604710457");
});

test("extractPageTransparencyPageIdFromText reads Page ID before number layouts", () => {
  assert.equal(
    __test.extractPageTransparencyPageIdFromText("Page transparency\nPage ID: 123456789012345"),
    "123456789012345"
  );
});

test("facebookAboutUrls builds transparency URLs for slug, profile, and people links", () => {
  assert.deepEqual(__test.facebookAboutUrls("https://www.facebook.com/StegbarAU/").slice(0, 2), [
    "https://www.facebook.com/StegbarAU/about_profile_transparency",
    "https://www.facebook.com/StegbarAU/about",
  ]);

  assert.deepEqual(__test.facebookAboutUrls("https://www.facebook.com/profile.php?id=100059053279187").slice(0, 2), [
    "https://www.facebook.com/profile.php?id=100059053279187&sk=about_profile_transparency",
    "https://www.facebook.com/profile.php?id=100059053279187&sk=about",
  ]);

  assert.deepEqual(__test.facebookAboutUrls("https://www.facebook.com/people/Golden-Sukhothai-Restaurant/61575302587044/").slice(0, 2), [
    "https://www.facebook.com/people/Golden-Sukhothai-Restaurant/61575302587044/about_profile_transparency",
    "https://www.facebook.com/people/Golden-Sukhothai-Restaurant/61575302587044/about",
  ]);
});

test("buildUniqueUrlMap collects facebook_url and nested social profile links", () => {
  const map = __test.buildUniqueUrlMap([
    { name: "Top Level", website: "https://one.example", facebook_url: "http://facebook.com/one/", __crm_file: "a.json", __crm_index: 0 },
    { name: "Nested", website_full: "https://two.example", social_profiles: { facebook: "https://www.facebook.com/two" }, __crm_file: "b.json", __crm_index: 1 },
    { name: "From Links", company_website: "https://three.example", social_links: ["https://www.instagram.com/nope", "https://m.facebook.com/three/"], __crm_file: "c.json", __crm_index: 2 },
    { name: "Duplicate", website: "https://one-branch.example", facebook_url: "https://www.facebook.com/one", __crm_file: "b.json", __crm_index: 3 },
    { name: "No Facebook", social_profiles: { instagram: "https://www.instagram.com/nope" } },
  ]);

  assert.equal(map.size, 3);
  assert.deepEqual(map.get("https://www.facebook.com/one").names, ["Top Level", "Duplicate"]);
  assert.deepEqual(map.get("https://www.facebook.com/one").websites, ["https://one.example", "https://one-branch.example"]);
  assert.deepEqual(map.get("https://www.facebook.com/one").crm_files, ["a.json", "b.json"]);
  assert.deepEqual(map.get("https://www.facebook.com/one").crm_refs, [{ file: "a.json", index: 0 }, { file: "b.json", index: 3 }]);
  assert.deepEqual(map.get("https://www.facebook.com/two").names, ["Nested"]);
  assert.deepEqual(map.get("https://www.facebook.com/two").websites, ["https://two.example"]);
  assert.deepEqual(map.get("https://www.facebook.com/three").names, ["From Links"]);
  assert.deepEqual(map.get("https://www.facebook.com/three").websites, ["https://three.example"]);
});

test("parseSelectedIndexes normalizes selected CRM row indexes", () => {
  assert.deepEqual(__test.parseSelectedIndexes("5, 2, nope, -1, 5, 0"), [0, 2, 5]);
  assert.deepEqual(__test.parseSelectedIndexes(""), []);
});

test("applyFacebookPageIdsToLeads writes found Page IDs back onto CRM leads", () => {
  const leads = [
    { name: "One" },
    { name: "Two" },
  ];

  const updated = __test.applyFacebookPageIdsToLeads(leads, [
    {
      status: "found",
      facebook_page_id: "1820291604710457",
      extraction_source: "about_transparency",
      scraped_at: "2026-05-07T00:00:00.000Z",
      crm_refs: [{ file: "leads.json", index: 1 }],
    },
    {
      status: "not_found",
      facebook_page_id: "",
      crm_refs: [{ file: "leads.json", index: 0 }],
    },
  ]);

  assert.equal(updated, 1);
  assert.equal(leads[0].facebook_page_id, undefined);
  assert.equal(leads[1].facebook_page_id, "1820291604710457");
  assert.equal(leads[1].facebook_page_id_source, "about_transparency");
  assert.equal(leads[1].facebook_page_id_scraped_at, "2026-05-07T00:00:00.000Z");
});
