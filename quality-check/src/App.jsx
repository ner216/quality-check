import { useEffect, useState } from 'react'
import './App.css'

const formatNumber = (value) =>
  value === null || value === undefined ? '—' : new Intl.NumberFormat().format(value)

const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—'

const formatAge = (days) => {
  if (days === null || days === undefined) return '—'
  const years = Math.floor(days / 365)
  const months = Math.floor((days % 365) / 30)
  if (years) return `${years}y ${months}m`
  if (months) return `${months} months`
  return `${days} days`
}

const severityLabel = { red: 'High signal', yellow: 'Watch', info: 'Context' }

function Metric({ label, value, note }) {
  return (
    <div className="metric">
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
      {note && <span className="metric-note">{note}</span>}
    </div>
  )
}

function App() {
  const [query, setQuery] = useState('')
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [theme, setTheme] = useState(() =>
    window.localStorage.getItem('quality-check-theme') === 'dark' ? 'dark' : 'light',
  )

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  function toggleTheme() {
    const nextTheme = theme === 'light' ? 'dark' : 'light'
    window.localStorage.setItem('quality-check-theme', nextTheme)
    setTheme(nextTheme)
  }

  async function analyzeRepository(event) {
    event.preventDefault()
    const repository = query.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\/$/, '')
    if (!repository) return

    setLoading(true)
    setError('')
    setReport(null)
    try {
      const response = await fetch(`/api/analyze?repo=${encodeURIComponent(repository)}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not analyze this repository.')
      setReport(data)
      setQuery(data.repository.full_name)
    } catch (requestError) {
      setError(requestError.message || 'The analysis request failed. Try again.')
    } finally {
      setLoading(false)
    }
  }

  const risk = report?.signals
  const riskTone = risk?.level === 'high' ? 'red' : risk?.level === 'watch' ? 'yellow' : 'green'

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="wordmark" href="/" aria-label="Quality Check home">
          <span className="wordmark-mark" aria-hidden="true">q</span>
          <span>quality check</span>
        </a>
        <button
          className="theme-switch"
          type="button"
          role="switch"
          aria-checked={theme === 'dark'}
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          onClick={toggleTheme}
        >
          <span className="theme-switch-track" aria-hidden="true"><span /></span>
          <span>{theme === 'light' ? 'Light' : 'Dark'}</span>
        </button>
      </header>

      <section className={`search-hero ${report ? 'search-hero-compact' : ''}`}>
        <h1>Repository quality check</h1>
        <p className="hero-copy">Review a project's health, activity, and pull request patterns.</p>
        <form className="search-form" onSubmit={analyzeRepository}>
          <span className="search-icon" aria-hidden="true">⌕</span>
          <label className="visually-hidden" htmlFor="repository">GitHub repository</label>
          <input
            id="repository"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="owner / repository"
            autoComplete="off"
            spellCheck="false"
          />
          <button type="submit" disabled={loading || !query.trim()}>
            {loading ? <><span className="spinner" /> Reading</> : <>Analyze <span aria-hidden="true">→</span></>}
          </button>
        </form>
        <div className="search-hint">Paste a GitHub URL or enter <code>owner/repo</code></div>
        {error && <div className="error-message" role="alert">{error}</div>}
      </section>

      {report && (
        <section className="report" aria-live="polite">
          <div className="report-heading">
            <div className="repo-identity">
              <div className="repo-avatar" aria-hidden="true">{report.repository.owner.slice(0, 1).toUpperCase()}</div>
              <div>
                <div className="repo-kicker">REPOSITORY REPORT</div>
                <h2><a href={report.repository.url} target="_blank" rel="noreferrer">{report.repository.full_name}<span aria-hidden="true"> ↗</span></a></h2>
                <p>{report.repository.description || 'No repository description provided.'}</p>
              </div>
            </div>
            <div className={`risk-summary ${riskTone}`}>
              <span className="risk-caption">REVIEW SIGNALS</span>
              <strong>{risk.score}<small>/100</small></strong>
              <span>{risk.level === 'high' ? 'Elevated' : risk.level === 'watch' ? 'Worth a closer look' : 'No strong flags'}</span>
            </div>
          </div>

          <div className="metrics-grid">
            <Metric label="Stars" value={formatNumber(report.repository.stars)} note={`${formatNumber(report.repository.watchers)} watching`} />
            <Metric label="Community health" value={report.repository.health_score === null ? '—' : `${report.repository.health_score}%`} note="GitHub profile score" />
            <Metric label="Total commits" value={formatNumber(report.repository.total_commits)} note={`${report.repository.default_branch} branch`} />
            <Metric label="Primary language" value={report.repository.language || 'Not set'} note="Most reported" />
            <Metric label="Last updated" value={formatDate(report.repository.updated_at)} note="Repository metadata" />
            <Metric label="Repository age" value={formatAge(report.repository.age_days)} note={`Created ${formatDate(report.repository.created_at)}`} />
          </div>

          <div className="analysis-grid">
            <section className="signals-panel">
              <div className="section-heading">
                <div><span className="section-index">01 / PATTERNS</span><h3>Recent pull requests</h3></div>
                <span className="sample-count">LAST {report.pull_requests.analyzed_count} REVIEWED</span>
              </div>
              <div className="pr-metrics">
                <div className="pr-metric"><strong>{report.pull_requests.average_commits ?? '—'}</strong><span>avg. commits / PR</span></div>
                <div className="pr-metric"><strong>{formatNumber(report.pull_requests.average_description_chars ?? 0)}</strong><span>avg. description chars</span></div>
                <div className="pr-metric"><strong>{report.pull_requests.missing_descriptions}</strong><span>empty descriptions</span></div>
              </div>

              <div className="flag-list">
                {risk.flags.length ? risk.flags.map((flag, index) => (
                  <div className={`flag-row ${flag.severity}`} key={`${flag.title}-${index}`}>
                    <span className="flag-indicator" aria-hidden="true" />
                    <div><strong>{flag.title}</strong><p>{flag.detail}</p></div>
                    <span className="flag-label">{severityLabel[flag.severity]}</span>
                  </div>
                )) : (
                  <div className="clear-state"><span aria-hidden="true">✓</span><div><strong>No standout PR pattern flags</strong><p>That is a useful signal, not a guarantee of code quality.</p></div></div>
                )}
              </div>
            </section>

            <aside className="context-panel">
              <div className="section-heading">
                <div><span className="section-index">02 / CONTEXT</span><h3>Recent activity</h3></div>
              </div>
              <div className="pr-list">
                {report.pull_requests.items.length ? report.pull_requests.items.map((pr) => (
                  <a className="pr-item" href={pr.url} target="_blank" rel="noreferrer" key={pr.number}>
                    <span className={`pr-state ${pr.state}`}>{pr.state === 'merged' ? '↗' : pr.state === 'open' ? '○' : '✓'}</span>
                    <span className="pr-copy"><strong>{pr.title}</strong><small>#{pr.number} · {formatDate(pr.created_at)}</small></span>
                    <span className="pr-count"><strong>{pr.commits}</strong><small>commits</small></span>
                  </a>
                )) : <p className="empty-prs">No recent pull requests found.</p>}
              </div>
            </aside>
          </div>

          <footer className="report-footer">
            <span>Heuristics describe observable repo activity; they cannot determine whether code was AI-generated.</span>
            <a href={report.repository.url} target="_blank" rel="noreferrer">View on GitHub ↗</a>
          </footer>
        </section>
      )}

      {!report && !loading && (
        <div className="empty-note"><span className="empty-rule" />Start with a public GitHub repository<span className="empty-rule" /></div>
      )}
    </main>
  )
}

export default App