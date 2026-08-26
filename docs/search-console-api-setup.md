# Search Console API daily SEO setup

This setup lets Codex read Google Search Console data without your Google password.
It uses a Google Cloud service account with read access to the Search Console property.

## 1. Create a Google Cloud project

1. Open Google Cloud Console.
2. Create or select a project for SEO reporting.
3. Enable the Google Search Console API.

Official docs:
- https://developers.google.com/webmaster-tools/v1/prereqs
- https://developers.google.com/webmaster-tools/v1/searchanalytics/query

## 2. Create a service account key

1. Open IAM & Admin > Service Accounts.
2. Create a service account, for example `gsc-daily-seo`.
3. Open the service account > Keys.
4. Add key > Create new key > JSON.
5. Download the JSON file.

Keep this JSON file private. Do not upload it to GitHub.

## 3. Put the key in this project

Create this folder locally:

```text
secrets/
```

Place the downloaded JSON file here:

```text
secrets/gsc-service-account.json
```

The `secrets/` folder is ignored by Git.

## 4. Add the service account to Search Console

1. Open Google Search Console.
2. Select this property:

```text
https://252595tana-alt.github.io/hp-lp-service/
```

3. Open Settings > Users and permissions.
4. Add the service account email from the JSON file.
5. Give it Full or Restricted access. Read-only reporting works with access that can view performance data.

Google's Search Console permissions page says new users are added from Settings > Users and permissions.

Official help:
- https://support.google.com/webmasters/answer/7687615

## 5. Install Python dependencies

If `python` is available:

```powershell
python -m venv .venv-gsc
.\.venv-gsc\Scripts\python.exe -m pip install -r requirements-gsc.txt
```

If only the bundled Codex Python is available:

```powershell
& 'C:\Users\syota\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -m venv .venv-gsc
.\.venv-gsc\Scripts\python.exe -m pip install -r requirements-gsc.txt
```

## 6. Run the report

```powershell
.\.venv-gsc\Scripts\python.exe scripts/gsc_daily_report.py
```

The report is saved under:

```text
reports/seo/
```

## What the report checks

- Total clicks, impressions, CTR, and average position
- Search queries from the last 28 days
- Pages receiving search visibility
- Sitemap status from Search Console
- SEO opportunities such as high impressions with low clicks
- Priority recommendations for the next site edits
