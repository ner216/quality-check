#!/usr/bin/env python3
"""Small JSON API for analyzing public GitHub repository activity."""

import json
import os
import re
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import requests


BASE_URL = "https://api.github.com"
RECENT_PR_COUNT = 7
HEADERS = {
    "Accept": "application/vnd.github+json",
    "User-Agent": "RepoScope-Repository-Analyzer",
}
if os.getenv("GITHUB_TOKEN"):
    HEADERS["Authorization"] = f"Bearer {os.environ['GITHUB_TOKEN']}"


class GitHubApiError(Exception):
    """An expected error returned by GitHub's API."""


def fetch_json(endpoint, params=None, optional=False):
    response = requests.get(
        f"{BASE_URL}{endpoint}", headers=HEADERS, params=params, timeout=20
    )
    if response.status_code == 404 and optional:
        return None
    if response.status_code == 404:
        raise GitHubApiError("Repository not found, or it is not publicly accessible.")
    if response.status_code == 403:
        raise GitHubApiError(
            "GitHub API rate limit reached. Set GITHUB_TOKEN and try again."
        )
    if not response.ok:
        raise GitHubApiError(f"GitHub returned an error ({response.status_code}).")
    return response


def total_commits(owner, repo, default_branch):
    response = fetch_json(
        f"/repos/{owner}/{repo}/commits",
        params={"sha": default_branch, "per_page": 1},
    )
    link_header = response.headers.get("Link", "")
    last_page = re.search(r'[?&]page=(\d+)>; rel="last"', link_header)
    if last_page:
        return int(last_page.group(1))
    return len(response.json())


def repository_age_days(created_at):
    created = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
    return max(0, (datetime.now(timezone.utc) - created).days)


def analyze_pull_requests(owner, repo):
    response = fetch_json(
        f"/repos/{owner}/{repo}/pulls",
        params={"state": "all", "sort": "created", "direction": "desc", "per_page": RECENT_PR_COUNT},
    )
    pull_requests = response.json()
    items = []
    for pull_request in pull_requests:
        number = pull_request["number"]
        details_response = fetch_json(f"/repos/{owner}/{repo}/pulls/{number}")
        details = details_response.json()
        description = details.get("body") or ""
        items.append(
            {
                "number": number,
                "title": details.get("title") or "Untitled pull request",
                "state": "merged" if details.get("merged_at") else details.get("state", "closed"),
                "created_at": details.get("created_at"),
                "url": details.get("html_url"),
                "commits": details.get("commits", 0),
                "description_length": len(description),
            }
        )

    commit_counts = [item["commits"] for item in items]
    description_lengths = [item["description_length"] for item in items]
    return {
        "analyzed_count": len(items),
        "average_commits": round(sum(commit_counts) / len(items), 1) if items else None,
        "average_description_chars": round(sum(description_lengths) / len(items)) if items else None,
        "longest_description_chars": max(description_lengths, default=0),
        "missing_descriptions": sum(length == 0 for length in description_lengths),
        "items": items,
    }


def score_signals(pull_requests):
    flags = []
    score = 0
    average_commits = pull_requests["average_commits"]
    average_description = pull_requests["average_description_chars"]
    analyzed_count = pull_requests["analyzed_count"]

    if average_commits is not None and average_commits > 20:
        score += 40
        flags.append(
            {
                "severity": "red",
                "title": "High commit volume per pull request",
                "detail": f"Recent PRs average {average_commits} commits. More than 20 is a strong review signal.",
            }
        )
    elif average_commits is not None and average_commits > 10:
        score += 20
        flags.append(
            {
                "severity": "yellow",
                "title": "Elevated commit volume per pull request",
                "detail": f"Recent PRs average {average_commits} commits, above the 10-commit watch threshold.",
            }
        )

    if average_description is not None and average_description > 5000:
        score += 40
        flags.append(
            {
                "severity": "red",
                "title": "Exceptionally long PR descriptions",
                "detail": f"Descriptions average {average_description:,} characters. Review for unusually verbose or templated content.",
            }
        )
    elif average_description is not None and average_description > 2000:
        score += 20
        flags.append(
            {
                "severity": "yellow",
                "title": "Long PR descriptions",
                "detail": f"Descriptions average {average_description:,} characters, above the 2,000-character watch threshold.",
            }
        )

    missing_count = pull_requests["missing_descriptions"]
    if analyzed_count and missing_count >= 4:
        score += 20
        flags.append(
            {
                "severity": "yellow",
                "title": "Several PRs have no description",
                "detail": f"{missing_count} of {analyzed_count} recent PRs have an empty description.",
            }
        )

    has_red_flag = any(flag["severity"] == "red" for flag in flags)
    level = "high" if score >= 35 or has_red_flag else "watch" if score else "low"
    return {"score": min(score, 100), "level": level, "flags": flags}


def analyze_repository(full_name):
    owner, repo_name = full_name.split("/", 1)
    repo_response = fetch_json(f"/repos/{owner}/{repo_name}")
    repo = repo_response.json()
    languages_response = fetch_json(f"/repos/{owner}/{repo_name}/languages", optional=True)
    community_response = fetch_json(f"/repos/{owner}/{repo_name}/community/profile", optional=True)
    languages = languages_response.json() if languages_response else {}
    community = community_response.json() if community_response else {}
    health_score = community.get("health_percentage")
    pull_requests = analyze_pull_requests(owner, repo_name)

    repository = {
        "owner": owner,
        "full_name": repo.get("full_name", full_name),
        "url": repo.get("html_url"),
        "description": repo.get("description"),
        "stars": repo.get("stargazers_count", 0),
        "watchers": repo.get("subscribers_count", 0),
        "forks": repo.get("forks_count", 0),
        "open_issues": repo.get("open_issues_count", 0),
        "health_score": health_score,
        "total_commits": total_commits(owner, repo_name, repo.get("default_branch", "main")),
        "default_branch": repo.get("default_branch", "main"),
        "language": max(languages, key=languages.get) if languages else repo.get("language"),
        "updated_at": repo.get("updated_at"),
        "created_at": repo.get("created_at"),
        "age_days": repository_age_days(repo["created_at"]) if repo.get("created_at") else None,
    }
    return {
        "repository": repository,
        "pull_requests": pull_requests,
        "signals": score_signals(pull_requests),
    }


class ApiHandler(BaseHTTPRequestHandler):
    def send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed_url = urlparse(self.path)
        if parsed_url.path != "/api/analyze":
            self.send_json(404, {"error": "Endpoint not found."})
            return

        full_name = parse_qs(parsed_url.query).get("repo", [""])[0].strip().strip("/")
        if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", full_name):
            self.send_json(400, {"error": "Enter a repository as owner/repo."})
            return

        try:
            self.send_json(200, analyze_repository(full_name))
        except GitHubApiError as error:
            self.send_json(404 if "not found" in str(error).lower() else 502, {"error": str(error)})
        except requests.RequestException:
            self.send_json(502, {"error": "Could not reach GitHub. Check your connection and retry."})
        except (KeyError, ValueError, TypeError):
            self.send_json(502, {"error": "GitHub returned incomplete repository data."})

    def log_message(self, _format, *_args):
        return


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    print(f"RepoScope API listening on http://127.0.0.1:{port}")
    ThreadingHTTPServer(("127.0.0.1", port), ApiHandler).serve_forever()