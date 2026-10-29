# RepoScope

RepoScope summarizes public GitHub repository metadata and recent pull request activity. Its review signals are heuristics for closer inspection, not a way to determine whether code was AI-generated.

## Run locally

Use Python 3.9+ and Node.js. In the `quality-check` app directory, install the Python dependency and JavaScript packages:

```bash
python -m pip install -r requirements.txt
npm install
```

Start the API and frontend in separate terminals:

```bash
python backend.py
```

```bash
npm run dev
```

Open the local URL printed by Vite. The development server proxies `/api` requests to the Python API on port 8000. Set `GITHUB_TOKEN` before starting the API to raise GitHub's unauthenticated rate limit.

## Run with Docker

From this directory, build and start the production container:

```bash
./deploy_docker.sh
```

The site will be available at `http://<server-address>:43827`. The container restarts automatically unless stopped. To use a different host port, set `QUALITY_CHECK_PORT` before running the script. Set `GITHUB_TOKEN` in the environment first to raise GitHub's unauthenticated API rate limit.

The script replaces the existing container named `quality-check` when redeployed. Set `CONTAINER_NAME` or `IMAGE_NAME` to customize these names.

## Commit signature

This repository includes a commit-message hook that adds an `Assisted-by: Copilot` trailer to commits when it is missing. Enable it from the repository root with:

```bash
git config core.hooksPath .githooks
```

## Signals

- The report includes repository stars, subscribers, community health, total default-branch commits, primary language, update date, and repository age.
- The latest seven pull requests are checked for average commits and average description length.
- More than 10 average commits per PR is a watch signal; more than 20 is a high signal.
- Average PR descriptions over 2,000 characters are a watch signal; over 5,000 are a high signal.
- Four or more empty descriptions among the reviewed PRs is a watch signal.

The 0–100 review-signal score is a weighted summary of these observable patterns. It is not a quality verdict and should be interpreted alongside the repository itself.