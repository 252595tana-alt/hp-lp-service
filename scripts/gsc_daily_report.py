import argparse
import datetime as dt
import json
import os
import sys
from pathlib import Path


DEFAULT_SITE_URL = "https://252595tana-alt.github.io/hp-lp-service/"
DEFAULT_KEY_FILE = Path("secrets/gsc-service-account.json")
DEFAULT_REPORT_DIR = Path("reports/seo")
SCOPES = ["https://www.googleapis.com/auth/webmasters.readonly"]


def require_google_libraries():
    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
    except ImportError:
        print(
            "Google API libraries are not installed.\n"
            "Run: python -m pip install -r requirements-gsc.txt",
            file=sys.stderr,
        )
        sys.exit(2)
    return service_account, build


def build_service(key_file: Path):
    service_account, build = require_google_libraries()
    if not key_file.exists():
        print(
            f"Missing service account key: {key_file}\n"
            "Follow docs/search-console-api-setup.md and place the JSON key there.",
            file=sys.stderr,
        )
        sys.exit(2)

    credentials = service_account.Credentials.from_service_account_file(
        str(key_file), scopes=SCOPES
    )
    return build("searchconsole", "v1", credentials=credentials)


def query_search_analytics(service, site_url, start_date, end_date, dimensions, row_limit=25):
    body = {
        "startDate": start_date.isoformat(),
        "endDate": end_date.isoformat(),
        "dimensions": dimensions,
        "rowLimit": row_limit,
        "startRow": 0,
    }
    return (
        service.searchanalytics()
        .query(siteUrl=site_url, body=body)
        .execute()
        .get("rows", [])
    )


def summarize_totals(rows):
    clicks = sum(row.get("clicks", 0) for row in rows)
    impressions = sum(row.get("impressions", 0) for row in rows)
    weighted_position = sum(
        row.get("position", 0) * row.get("impressions", 0) for row in rows
    )
    ctr = clicks / impressions if impressions else 0
    avg_position = weighted_position / impressions if impressions else 0
    return clicks, impressions, ctr, avg_position


def format_percent(value):
    return f"{value * 100:.2f}%"


def row_to_markdown(row):
    key = " / ".join(row.get("keys", []))
    clicks = row.get("clicks", 0)
    impressions = row.get("impressions", 0)
    ctr = format_percent(row.get("ctr", 0))
    position = row.get("position", 0)
    return f"| {key} | {clicks:.0f} | {impressions:.0f} | {ctr} | {position:.1f} |"


def opportunity_notes(query_rows, page_rows):
    notes = []

    low_ctr = [
        row for row in query_rows
        if row.get("impressions", 0) >= 5 and row.get("ctr", 0) < 0.02
    ]
    if low_ctr:
        terms = ", ".join(" / ".join(row.get("keys", [])) for row in low_ctr[:5])
        notes.append(f"CTRが低い検索語句があります。タイトルや説明文の見直し候補: {terms}")

    almost_ranking = [
        row for row in query_rows
        if 8 <= row.get("position", 0) <= 30 and row.get("impressions", 0) >= 3
    ]
    if almost_ranking:
        terms = ", ".join(" / ".join(row.get("keys", [])) for row in almost_ranking[:5])
        notes.append(f"順位改善の余地がある検索語句があります。本文追記や内部リンク強化候補: {terms}")

    pages_without_clicks = [
        row for row in page_rows
        if row.get("impressions", 0) >= 5 and row.get("clicks", 0) == 0
    ]
    if pages_without_clicks:
        pages = ", ".join(" / ".join(row.get("keys", [])) for row in pages_without_clicks[:3])
        notes.append(f"表示はあるがクリックがないページがあります。検索結果向けの見出しを調整候補: {pages}")

    if not notes:
        notes.append("大きな改善候補はまだ少なめです。データが増えるまで記事追加と内部リンク強化を継続します。")

    return notes


def sitemap_status(service, site_url):
    try:
        result = service.sitemaps().list(siteUrl=site_url).execute()
    except Exception as exc:
        return [f"サイトマップ取得に失敗: {exc}"]

    sitemaps = result.get("sitemap", [])
    if not sitemaps:
        return ["Search Console API上では送信済みサイトマップが見つかりませんでした。"]

    lines = []
    for sitemap in sitemaps:
        path = sitemap.get("path", "(unknown)")
        submitted = sitemap.get("lastSubmitted", "unknown")
        warnings = sitemap.get("warnings", 0)
        errors = sitemap.get("errors", 0)
        lines.append(f"{path} / submitted: {submitted} / warnings: {warnings} / errors: {errors}")
    return lines


def make_report(service, site_url, days):
    today = dt.date.today()
    # Search Console data is often delayed, so end a few days before today.
    end_date = today - dt.timedelta(days=3)
    start_date = end_date - dt.timedelta(days=days - 1)

    query_rows = query_search_analytics(
        service, site_url, start_date, end_date, ["query"], row_limit=50
    )
    page_rows = query_search_analytics(
        service, site_url, start_date, end_date, ["page"], row_limit=25
    )
    date_rows = query_search_analytics(
        service, site_url, start_date, end_date, ["date"], row_limit=days
    )

    clicks, impressions, ctr, avg_position = summarize_totals(date_rows)
    notes = opportunity_notes(query_rows, page_rows)
    sitemaps = sitemap_status(service, site_url)

    report_date = today.isoformat()
    lines = [
        f"# Search Console SEO Report - {report_date}",
        "",
        f"Property: `{site_url}`",
        f"Period: `{start_date}` to `{end_date}`",
        "",
        "## Summary",
        "",
        f"- Clicks: {clicks:.0f}",
        f"- Impressions: {impressions:.0f}",
        f"- CTR: {format_percent(ctr)}",
        f"- Average position: {avg_position:.1f}",
        "",
        "## Priority Notes",
        "",
    ]
    lines.extend(f"- {note}" for note in notes)
    lines.extend(["", "## Top Queries", "", "| Query | Clicks | Impressions | CTR | Position |", "| --- | ---: | ---: | ---: | ---: |"])
    lines.extend(row_to_markdown(row) for row in query_rows[:20])
    lines.extend(["", "## Top Pages", "", "| Page | Clicks | Impressions | CTR | Position |", "| --- | ---: | ---: | ---: | ---: |"])
    lines.extend(row_to_markdown(row) for row in page_rows[:15])
    lines.extend(["", "## Sitemaps", ""])
    lines.extend(f"- {line}" for line in sitemaps)
    lines.append("")
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Create a daily Google Search Console SEO report.")
    parser.add_argument("--site-url", default=os.environ.get("GSC_SITE_URL", DEFAULT_SITE_URL))
    parser.add_argument("--key-file", default=os.environ.get("GSC_SERVICE_ACCOUNT_JSON", str(DEFAULT_KEY_FILE)))
    parser.add_argument("--days", type=int, default=28)
    parser.add_argument("--out-dir", default=str(DEFAULT_REPORT_DIR))
    args = parser.parse_args()

    service = build_service(Path(args.key_file))
    report = make_report(service, args.site_url, args.days)

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / f"gsc-report-{dt.date.today().isoformat()}.md"
    out_file.write_text(report, encoding="utf-8")

    print(report)
    print(f"\nSaved: {out_file}")


if __name__ == "__main__":
    main()
