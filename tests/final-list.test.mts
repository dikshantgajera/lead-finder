import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  findAdsWorkflow,
} = require("../agent/final_list.js");

function writeCrmFile(dir: string, leads: unknown[]) {
  const sourceFile = "leads-test.json";
  writeFileSync(path.join(dir, sourceFile), JSON.stringify(leads, null, 2));
  return sourceFile;
}

const baseLeads = [
  {
    name: "No Ads Cafe",
    phone: "111",
    address_full: "12 Market Road, Indiranagar, Bengaluru, Karnataka 560038, India",
    website: "https://noads.example",
    category: "Cafe",
    facebook_url: "https://www.facebook.com/noadscafe",
  },
  {
    name: "Running Ads Cafe",
    phone: "222",
    address_full: "18 Market Road, Indiranagar, Bengaluru, Karnataka 560038, India",
    website: "https://running.example",
    category: "Cafe",
    instagram_url: "https://www.instagram.com/runningadscafe/",
  },
  {
    name: "No Social Cafe",
    phone: "333",
    address_full: "44 Market Road, Indiranagar, Bengaluru, Karnataka 560038, India",
    website: "https://nosocial.example",
    category: "Cafe",
  },
  {
    name: "Nearby Cafe",
    phone: "444",
    address_full: "20 Market Road, Indiranagar, Bengaluru, Karnataka 560038, India",
    website: "https://nearby.example",
    category: "Cafe",
    facebook_url: "https://www.facebook.com/nearbycafe",
  },
  {
    name: "Far Cafe",
    phone: "555",
    address_full: "7 Beach Road, Panaji, Goa 403001, India",
    website: "https://far.example",
    category: "Cafe",
    facebook_url: "https://www.facebook.com/farcafe",
  },
];

test("Find Ads saves social leads with no ads, skips running ads and no-social leads", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "find-ads-"));
  const crmDir = path.join(root, "crm");
  const finalListPath = path.join(root, "final-list.json");
  await import("node:fs/promises").then(fs => fs.mkdir(crmDir, { recursive: true }));
  const sourceFile = writeCrmFile(crmDir, baseLeads);

  const result = await findAdsWorkflow({
    sourceFile,
    crmDir,
    finalListPath,
    throttleMs: 0,
    adsChecker: async ({ lead }: { lead: { name: string } }) => ({
      ads_status: lead.name === "Running Ads Cafe" ? "running_ads" : "not_running_ads",
      warnings: [],
    }),
  });

  assert.equal(result.success, true);
  assert.equal(result.checked, 4);
  assert.equal(result.skipped, 1);
  assert.equal(result.runningAds, 1);
  assert.equal(result.notRunningAds, 3);
  assert.equal(result.saved, 3);
  assert.equal(result.finalList.some((item: any) => item.company.name === "No Ads Cafe"), true);
  assert.equal(result.finalList.some((item: any) => item.company.name === "Running Ads Cafe"), false);
  assert.equal(result.finalList.some((item: any) => item.company.name === "No Social Cafe"), false);
  assert.deepEqual(result.skippedLeads, [
    { index: 2, name: "No Social Cafe", skipped_reason: "missing_social_profiles" },
  ]);

  const persisted = JSON.parse(readFileSync(finalListPath, "utf8"));
  assert.equal(persisted.length, 3);
});

test("Find Ads supports one-lead dry runs and reports exact failed lead reasons", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "find-ads-"));
  const crmDir = path.join(root, "crm");
  const finalListPath = path.join(root, "final-list.json");
  await import("node:fs/promises").then(fs => fs.mkdir(crmDir, { recursive: true }));
  const sourceFile = writeCrmFile(crmDir, baseLeads);
  const checkedNames: string[] = [];

  const result = await findAdsWorkflow({
    sourceFile,
    crmDir,
    finalListPath,
    selectedIndexes: [1],
    dryRun: true,
    throttleMs: 0,
    adsChecker: async ({ lead }: { lead: { name: string } }) => {
      checkedNames.push(lead.name);
      return {
        ads_status: "skipped",
        activeAdsCount: 0,
        failedReason: "Ad status unavailable",
        warnings: ["Ad status unavailable"],
      };
    },
  });

  assert.deepEqual(checkedNames, ["Running Ads Cafe"]);
  assert.equal(result.success, true);
  assert.equal(result.dryRun, true);
  assert.equal(result.checked, 1);
  assert.equal(result.skipped, 1);
  assert.equal(result.saved, 0);
  assert.deepEqual(result.failedLeads, [
    {
      index: 1,
      name: "Running Ads Cafe",
      reason: "Ad status unavailable",
    },
  ]);
  assert.equal(existsSync(finalListPath), false);
});

test("Find Ads chooses only two nearby competitors from the same address area", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "find-ads-"));
  const crmDir = path.join(root, "crm");
  const finalListPath = path.join(root, "final-list.json");
  await import("node:fs/promises").then(fs => fs.mkdir(crmDir, { recursive: true }));
  const sourceFile = writeCrmFile(crmDir, baseLeads);

  const result = await findAdsWorkflow({
    sourceFile,
    crmDir,
    finalListPath,
    throttleMs: 0,
    adsChecker: async ({ lead }: { lead: { name: string } }) => ({
      ads_status: lead.name === "No Ads Cafe" ? "not_running_ads" : "running_ads",
      warnings: [],
    }),
  });

  const noAds = result.finalList.find((item: any) => item.company.name === "No Ads Cafe");
  assert.ok(noAds);
  assert.equal(noAds.competitors.length, 2);
  assert.deepEqual(noAds.competitors.map((competitor: any) => competitor.name), [
    "Running Ads Cafe",
    "Nearby Cafe",
  ]);
  assert.equal(noAds.competitors.some((competitor: any) => competitor.name === "Far Cafe"), false);
});

test("not-running lead with 3 running competitors returns the top 2 running competitors", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "find-ads-"));
  const crmDir = path.join(root, "crm");
  const finalListPath = path.join(root, "final-list.json");
  await import("node:fs/promises").then(fs => fs.mkdir(crmDir, { recursive: true }));
  const sourceFile = writeCrmFile(crmDir, [
    baseLeads[0],
    baseLeads[1],
    baseLeads[3],
    { ...baseLeads[4], address_full: "21 Market Road, Indiranagar, Bengaluru, Karnataka 560038, India" },
  ]);

  const result = await findAdsWorkflow({
    sourceFile,
    crmDir,
    finalListPath,
    throttleMs: 0,
    adsChecker: async ({ lead }: { lead: { name: string } }) => ({
      ads_status: lead.name === "No Ads Cafe" ? "not_running_ads" : "running_ads",
      activeAdsCount: lead.name === "Nearby Cafe" ? 4 : 1,
      warnings: [],
    }),
  });

  const noAds = result.finalList.find((item: any) => item.company.name === "No Ads Cafe");
  assert.equal(noAds.competitors.length, 2);
  assert.deepEqual(noAds.competitors.map((competitor: any) => competitor.ads_status), ["running_ads", "running_ads"]);
  assert.equal(noAds.competitors.every((competitor: any) => typeof competitor.competitor_score === "number"), true);
  assert.equal(noAds.competitors.every((competitor: any) => Array.isArray(competitor.competitor_match_reasons)), true);
});

test("not-running lead with 0 running competitors returns empty competitors and warning", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "find-ads-"));
  const crmDir = path.join(root, "crm");
  const finalListPath = path.join(root, "final-list.json");
  await import("node:fs/promises").then(fs => fs.mkdir(crmDir, { recursive: true }));
  const sourceFile = writeCrmFile(crmDir, [baseLeads[0], baseLeads[3]]);

  const result = await findAdsWorkflow({
    sourceFile,
    crmDir,
    finalListPath,
    throttleMs: 0,
    adsChecker: async () => ({ ads_status: "not_running_ads", warnings: [] }),
  });

  const noAds = result.finalList.find((item: any) => item.company.name === "No Ads Cafe");
  assert.deepEqual(noAds.competitors, []);
  assert.match(noAds.warnings.join(" | "), /Only 0 running-ad competitors found for this company\./);
});

test("not-running competitor is not selected by default", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "find-ads-"));
  const crmDir = path.join(root, "crm");
  const finalListPath = path.join(root, "final-list.json");
  await import("node:fs/promises").then(fs => fs.mkdir(crmDir, { recursive: true }));
  const sourceFile = writeCrmFile(crmDir, [baseLeads[0], baseLeads[3], baseLeads[4]]);

  const result = await findAdsWorkflow({
    sourceFile,
    crmDir,
    finalListPath,
    throttleMs: 0,
    adsChecker: async ({ lead }: { lead: { name: string } }) => ({
      ads_status: lead.name === "Far Cafe" ? "running_ads" : "not_running_ads",
      activeAdsCount: lead.name === "Far Cafe" ? 1 : 0,
      warnings: [],
    }),
  });

  const noAds = result.finalList.find((item: any) => item.company.name === "No Ads Cafe");
  assert.deepEqual(noAds.competitors.map((competitor: any) => competitor.name), ["Far Cafe"]);
  assert.equal(noAds.competitors.some((competitor: any) => competitor.name === "Nearby Cafe"), false);
});

test("same competitor is not repeated in the same row", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "find-ads-"));
  const crmDir = path.join(root, "crm");
  const finalListPath = path.join(root, "final-list.json");
  await import("node:fs/promises").then(fs => fs.mkdir(crmDir, { recursive: true }));
  const duplicate = { ...baseLeads[1], phone: "222", website: "https://running.example" };
  const sourceFile = writeCrmFile(crmDir, [baseLeads[0], baseLeads[1], duplicate, baseLeads[3]]);

  const result = await findAdsWorkflow({
    sourceFile,
    crmDir,
    finalListPath,
    throttleMs: 0,
    adsChecker: async ({ lead }: { lead: { name: string } }) => ({
      ads_status: lead.name === "No Ads Cafe" ? "not_running_ads" : "running_ads",
      activeAdsCount: 1,
      warnings: [],
    }),
  });

  const noAds = result.finalList.find((item: any) => item.company.name === "No Ads Cafe");
  assert.deepEqual(noAds.competitors.map((competitor: any) => competitor.name), ["Running Ads Cafe", "Nearby Cafe"]);
});

test("repeated competitor across rows is penalized", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "find-ads-"));
  const crmDir = path.join(root, "crm");
  const finalListPath = path.join(root, "final-list.json");
  await import("node:fs/promises").then(fs => fs.mkdir(crmDir, { recursive: true }));
  const leads = [
    { ...baseLeads[0], name: "No Ads Cafe A", phone: "111a" },
    { ...baseLeads[0], name: "No Ads Cafe B", phone: "111b" },
    { ...baseLeads[1], name: "Running Cafe One", phone: "221", website: "https://run1.example", facebook_url: "https://www.facebook.com/run1" },
    { ...baseLeads[1], name: "Running Cafe Two", phone: "222", website: "https://run2.example", facebook_url: "https://www.facebook.com/run2" },
    { ...baseLeads[1], name: "Running Cafe Three", phone: "223", website: "https://run3.example", facebook_url: "https://www.facebook.com/run3" },
  ];
  const sourceFile = writeCrmFile(crmDir, leads);

  const result = await findAdsWorkflow({
    sourceFile,
    crmDir,
    finalListPath,
    throttleMs: 0,
    adsChecker: async ({ lead }: { lead: { name: string } }) => ({
      ads_status: lead.name.startsWith("No Ads") ? "not_running_ads" : "running_ads",
      activeAdsCount: 1,
      warnings: [],
    }),
  });

  const second = result.finalList.find((item: any) => item.company.name === "No Ads Cafe B");
  assert.equal(second.competitors[0].name, "Running Cafe Three");
  assert.match(second.competitors[1].competitor_match_reasons.join(" "), /usage_penalty_1/);
});

test("Final List UI is renamed and exposes the saved-record columns", () => {
  const html = readFileSync(path.resolve("public/index.html"), "utf8");
  const app = readFileSync(path.resolve("public/app.js"), "utf8");

  assert.match(html, /Final List/);
  assert.doesNotMatch(html, /Email List/);
  assert.match(html, /Find Ads/);
  assert.match(html, /Competitor 1/);
  assert.match(html, /Competitor 2/);
  assert.match(html, /Checked At/);
  assert.match(app, /\/api\/crm\/find-ads/);
  assert.match(app, /\/api\/final-list/);
  assert.doesNotMatch(app, /Email List|email list|view-emails|tab-emails/);
});
