# Hosted Setup Guide

This guide is for the hosted stack implemented in this repo:

- Frontend: Cloudflare Pages
- API/Orchestration: Cloudflare Worker
- Auth + file storage + job metadata: Supabase
- Playwright jobs: GitHub Actions

This guide assumes:

- your local repo path is `/home/dikxant/lead finder`
- your GitHub branch is `main`
- you want the hosted mode, not the old local Express mode

## 1. Prepare the repo locally

Run these commands from the repo root:

```bash
cd "/home/dikxant/lead finder"
npm run check
npm test
```

Install Wrangler locally if you do not already have it:

```bash
npm install -D wrangler@latest
```

Copy the example Worker secrets file for local Worker testing:

```bash
cp .dev.vars.example .dev.vars
```

Open `.dev.vars` and replace every placeholder value.

## 2. Create the GitHub repository and push the code

If you do not already have a GitHub repo:

1. Go to `https://github.com/new`
2. Create a repository
3. Copy the HTTPS remote URL

Then run:

```bash
cd "/home/dikxant/lead finder"
git init
git branch -M main
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/YOUR_REPO_NAME.git
```

Add only the hosted-stack files first:

```bash
git add \
  .github/workflows/search.yml \
  .github/workflows/enrich.yml \
  .github/workflows/fb-page-ids.yml \
  .github/workflows/find-ads.yml \
  .dev.vars.example \
  HOSTED_SETUP.md \
  public/index.html \
  public/app.js \
  public/hosted.js \
  public/runtime-config.js \
  public/runtime-config.example.js \
  scripts/check-fb-page-ads.js \
  scripts/hosted/run-job.js \
  scripts/hosted/supabase.js \
  supabase/migrations/0001_hosted_schema.sql \
  worker/index.mjs \
  wrangler.toml \
  package.json \
  package-lock.json
```

Review what will be committed:

```bash
git status
git diff --cached --stat
```

Commit:

```bash
git commit -m "Add hosted Cloudflare/Supabase/GitHub Actions stack"
```

Push:

```bash
git push -u origin main
```

If the repo already exists and already has commits, use:

```bash
git remote -v
git add .
git commit -m "Add hosted Cloudflare/Supabase/GitHub Actions stack"
git push origin main
```

## 3. Create the Supabase project

1. Go to `https://supabase.com/dashboard`
2. Click `New project`
3. Choose your organization
4. Enter:
   - Project name: `leadfinder`
   - Database password: generate and save it
   - Region: choose the closest region
5. Click `Create new project`
6. Wait until the project finishes provisioning

## 4. Get the Supabase keys you need

In Supabase dashboard:

1. Open your project
2. Go to `Project Settings`
3. Go to `API`
4. Copy these values:
   - `Project URL`
   - `anon public` key
   - `service_role` key

Save them somewhere safe. You will use them in multiple places.

## 5. Run the SQL migration in Supabase

In Supabase dashboard:

1. Go to `SQL Editor`
2. Click `New query`
3. Open [supabase/migrations/0001_hosted_schema.sql](/home/dikxant/lead%20finder/supabase/migrations/0001_hosted_schema.sql)
4. Copy the full file contents
5. Paste into the SQL editor
6. Click `Run`

This creates:

- `files` table
- `jobs` table
- RLS policies
- storage buckets:
  - `leads`
  - `crm`
  - `final-list`
  - `fb-page-id-reports`

## 6. Configure Supabase Auth for magic links

Official docs: https://supabase.com/docs/guides/auth/auth-email-passwordless

In Supabase dashboard:

1. Go to `Authentication`
2. Go to `Providers`
3. Open `Email`
4. Make sure email auth is enabled
5. Leave passwordless / magic link enabled

Then configure redirect URLs:

1. Go to `Authentication`
2. Go to `URL Configuration`
3. Set `Site URL`
   - use your future Pages URL first, for example:
     - `https://YOUR_PROJECT.pages.dev`
4. Add `Redirect URLs`
   - `https://YOUR_PROJECT.pages.dev`
   - `http://localhost:8787`
   - your custom domain later, if you add one

## 7. Verify the Storage buckets

In Supabase dashboard:

1. Go to `Storage`
2. Confirm these buckets exist:
   - `leads`
   - `crm`
   - `final-list`
   - `fb-page-id-reports`
3. Make sure they are private

If any bucket is missing, create it manually:

1. Click `New bucket`
2. Use the exact bucket name
3. Leave it private

## 8. Create a GitHub Personal Access Token for the Worker

The Cloudflare Worker triggers GitHub Actions workflow dispatches, so it needs a GitHub token.

Create one:

1. Go to `https://github.com/settings/personal-access-tokens`
2. Create a fine-grained personal access token
3. Grant it access to this repo
4. Give it permission to Actions and repository contents sufficient to dispatch workflows
5. Copy the token value

## 9. Add GitHub Actions repository secrets

Official docs: https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-your-workflow-does/use-secrets

In GitHub:

1. Open your repo
2. Go to `Settings`
3. Go to `Secrets and variables`
4. Go to `Actions`
5. Add these repository secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Values:

- `SUPABASE_URL` = your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` = your Supabase service role key

## 10. Edit the frontend runtime config before deploy

Open [public/runtime-config.js](/home/dikxant/lead%20finder/public/runtime-config.js)

Replace it with real values like this:

```js
window.__LEADFINDER_CONFIG__ = {
  mode: 'hosted',
  apiBaseUrl: 'https://leadfinder-worker.YOUR_SUBDOMAIN.workers.dev',
  supabaseUrl: 'https://YOUR_PROJECT.supabase.co',
  supabaseAnonKey: 'YOUR_SUPABASE_ANON_KEY',
};
```

Important:

- `mode` must be `'hosted'`
- `apiBaseUrl` must be your deployed Worker URL
- `supabaseUrl` must be your actual project URL
- `supabaseAnonKey` must be your actual anon key

After editing, commit and push again:

```bash
git add public/runtime-config.js
git commit -m "Configure hosted runtime"
git push origin main
```

## 11. Log in to Cloudflare locally

Official docs: https://developers.cloudflare.com/workers/wrangler/install-and-update/

Run:

```bash
cd "/home/dikxant/lead finder"
npx wrangler login
```

A browser window will open.

Sign in to Cloudflare and authorize Wrangler.

## 12. Create the Worker secrets in Cloudflare

Official docs: https://developers.cloudflare.com/workers/configuration/secrets/

Run these commands one by one:

```bash
cd "/home/dikxant/lead finder"
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_ANON_KEY
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put GITHUB_OWNER
npx wrangler secret put GITHUB_REPO
npx wrangler secret put GITHUB_REF
```

When prompted, paste the value for each secret.

Use:

- `SUPABASE_URL` = your Supabase project URL
- `SUPABASE_ANON_KEY` = your Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY` = your Supabase service role key
- `GITHUB_TOKEN` = the GitHub PAT you created
- `GITHUB_OWNER` = your GitHub username or org
- `GITHUB_REPO` = your GitHub repo name
- `GITHUB_REF` = `main`

## 13. Deploy the Worker

Run:

```bash
cd "/home/dikxant/lead finder"
npm run worker:deploy
```

After deploy completes:

1. Copy the Worker URL
2. It will look like:
   - `https://leadfinder-worker.YOUR_SUBDOMAIN.workers.dev`
3. Put that value into `public/runtime-config.js` as `apiBaseUrl`

If you changed `public/runtime-config.js`, commit and push again:

```bash
git add public/runtime-config.js
git commit -m "Set Cloudflare Worker URL"
git push origin main
```

## 14. Test the Worker locally before frontend deploy

Optional but recommended.

Populate `.dev.vars` first, then run:

```bash
cd "/home/dikxant/lead finder"
npm run worker:dev
```

Test:

- `GET /api/health`
- sign-in flow from the frontend later
- job creation once the frontend is deployed

## 15. Deploy the frontend on Cloudflare Pages

Official docs: https://developers.cloudflare.com/pages/framework-guides/deploy-anything/

In Cloudflare dashboard:

1. Go to `Workers & Pages`
2. Click `Create application`
3. Choose `Pages`
4. Choose `Import an existing Git repository`
5. Connect GitHub if prompted
6. Select your repository
7. Click `Begin setup`

Use these settings:

- Production branch: `main`
- Framework preset: `None`
- Build command: `exit 0`
- Build output directory: `public`

Click `Save and Deploy`

Wait for the first deployment to finish.

## 16. Update Supabase Site URL after Pages deploy

Once Pages gives you your real URL:

1. Copy the Pages URL
   - example: `https://leadfinder-app.pages.dev`
2. Go back to Supabase
3. Go to `Authentication` > `URL Configuration`
4. Set:
   - `Site URL` = your actual Pages URL
5. Add it to `Redirect URLs` if it is not already there

## 17. Test the hosted app end to end

Open your Pages site.

Test this exact order:

1. Click `Hosted Sign In`
2. Enter your email
3. Open the magic link from your email
4. Return to the app
5. Go to `Search`
6. Run a hosted search
7. Confirm a leads file is created
8. Open `Leads Library`
9. Open the saved leads file
10. Run `Find Leads (Enrich)`
11. Open `CRM`
12. Open the generated CRM file
13. Run `Get FB Page IDs`
14. Check `FB Page ID Reports`
15. Run `Find Ads`
16. Open `Final List`
17. Export CSV from each section

## 18. If a GitHub Actions job does not run

Check these places:

1. GitHub repo
2. `Actions` tab
3. Open the latest run for:
   - `Hosted Search`
   - `Hosted Enrich`
   - `Hosted FB Page IDs`
   - `Hosted Find Ads`

Common causes:

- missing `SUPABASE_URL` secret
- missing `SUPABASE_SERVICE_ROLE_KEY` secret
- Worker `GITHUB_TOKEN` is wrong
- Worker `GITHUB_OWNER` or `GITHUB_REPO` is wrong
- branch name is not `main`

## 19. If login works but the app cannot load files

Check:

1. Supabase RLS policies were created successfully
2. Storage buckets exist
3. `public/runtime-config.js` uses the correct `supabaseUrl`
4. `public/runtime-config.js` uses the correct `supabaseAnonKey`
5. Worker has the correct `SUPABASE_ANON_KEY`

## 20. Future pushes after setup

For normal code changes:

```bash
cd "/home/dikxant/lead finder"
git add .
git commit -m "Describe the change"
git push origin main
```

What happens next:

- GitHub stores the code
- Cloudflare Pages redeploys the frontend from `main`
- GitHub Actions workflows update automatically because they live in the repo
- Cloudflare Worker does not redeploy automatically from GitHub in this setup

When you change Worker code, redeploy it manually:

```bash
cd "/home/dikxant/lead finder"
npm run worker:deploy
```

## 21. Commands summary

Initial local checks:

```bash
cd "/home/dikxant/lead finder"
npm run check
npm test
```

Worker local dev:

```bash
npm run worker:dev
```

Worker deploy:

```bash
npm run worker:deploy
```

Git push:

```bash
git add .
git commit -m "Your message"
git push origin main
```
