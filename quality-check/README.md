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

## Signals

- The report includes repository stars, subscribers, community health, total default-branch commits, primary language, update date, and repository age.
- The latest seven pull requests are checked for average commits and average description length.
- More than 10 average commits per PR is a watch signal; more than 20 is a high signal.
- Average PR descriptions over 2,000 characters are a watch signal; over 5,000 are a high signal.
- Four or more empty descriptions among the reviewed PRs is a watch signal.

The 0–100 review-signal score is a weighted summary of these observable patterns. It is not a quality verdict and should be interpreted alongside the repository itself.