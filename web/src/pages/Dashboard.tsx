/**
 * Recruiter pipeline dashboard — lists all applications with filtering.
 */

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api, ReviewerApplication } from '../api/client';

const STATUS_COLORS: Record<string, string> = {
  IN_PROGRESS: '#f59e0b',
  COMPLETE:    '#3b82f6',
  ADVANCED:    '#10b981',
  REJECTED:    '#ef4444',
  ON_HOLD:     '#8b5cf6',
};

const RUBRIC_DIMENSIONS = [
  { key: 'api_webhook_literacy', label: 'API / Webhook' },
  { key: 'automation_design',    label: 'Automation Design' },
  { key: 'llm_prompt_craft',     label: 'LLM / Prompts' },
  { key: 'debugging_approach',   label: 'Debugging' },
  { key: 'communication',        label: 'Communication' },
];

export default function Dashboard() {
  const [reviewerKey, setReviewerKey] = useState(localStorage.getItem('reviewerKey') ?? '');
  const [authed, setAuthed] = useState(false);
  const [applications, setApplications] = useState<ReviewerApplication[]>([]);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!reviewerKey) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.listApplications(reviewerKey, statusFilter || undefined);
      setApplications(result.data);
      setTotal(result.total);
      setAuthed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
      setAuthed(false);
    } finally {
      setLoading(false);
    }
  }, [reviewerKey, statusFilter]);

  useEffect(() => { if (authed || reviewerKey) load(); }, [statusFilter]); // eslint-disable-line

  function handleKeySubmit(e: React.FormEvent) {
    e.preventDefault();
    localStorage.setItem('reviewerKey', reviewerKey);
    load();
  }

  if (!authed) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
        <div style={{ background: 'white', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: '2.5rem', maxWidth: 400, width: '100%' }}>
          <h2 style={{ margin: '0 0 1.5rem' }}>Reviewer Login</h2>
          <form onSubmit={handleKeySubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <input
              type="password"
              placeholder="Reviewer API key"
              value={reviewerKey}
              onChange={(e) => setReviewerKey(e.target.value)}
              style={{ padding: '0.75rem', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '1rem' }}
            />
            {error && <div style={{ color: '#dc2626', fontSize: '0.875rem' }}>{error}</div>}
            <button type="submit" style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: 8, padding: '0.75rem', fontSize: '1rem', cursor: 'pointer' }}>
              Access dashboard
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <header style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '1rem 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.25rem' }}>AI Ops Analyst Pipeline</h1>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: '#64748b' }}>{total} total applications</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {['', 'IN_PROGRESS', 'COMPLETE', 'ADVANCED', 'REJECTED'].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              style={{
                padding: '0.4rem 0.75rem', borderRadius: 6, border: '1.5px solid',
                borderColor: statusFilter === s ? '#2563eb' : '#e2e8f0',
                background: statusFilter === s ? '#eff6ff' : 'white',
                color: statusFilter === s ? '#1d4ed8' : '#64748b',
                fontSize: '0.8rem', cursor: 'pointer',
              }}
            >
              {s || 'All'}
            </button>
          ))}
        </div>
      </header>

      <div style={{ padding: '1.5rem 2rem' }}>
        {loading && <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>Loading…</div>}

        {!loading && applications.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>No applications yet.</div>
        )}

        {!loading && applications.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  {['Candidate', 'Status', 'Session', 'Messages', 'Avg Score', 'Applied', 'Actions'].map((h) => (
                    <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {applications.map((app, i) => (
                  <tr key={app.id} style={{ borderBottom: i < applications.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                    <td style={{ padding: '1rem', fontWeight: 500 }}>
                      {app.candidate.fullName ?? 'Unknown'}
                      {app.candidate.primaryEmail && (
                        <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{app.candidate.primaryEmail}</div>
                      )}
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <span style={{
                        background: STATUS_COLORS[app.status] + '20',
                        color: STATUS_COLORS[app.status] ?? '#64748b',
                        padding: '0.25rem 0.6rem', borderRadius: 999,
                        fontSize: '0.78rem', fontWeight: 600,
                      }}>
                        {app.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td style={{ padding: '1rem', fontSize: '0.875rem', color: '#475569' }}>
                      {app.sessionState ?? '—'}
                      {app.sessionStep && app.sessionStep !== app.sessionState && (
                        <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{app.sessionStep}</div>
                      )}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'center', color: '#475569' }}>{app.messageCount}</td>
                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                      {app.avgScore != null ? (
                        <span style={{ fontWeight: 700, color: app.avgScore >= 4 ? '#10b981' : app.avgScore >= 3 ? '#f59e0b' : '#ef4444' }}>
                          {app.avgScore.toFixed(1)}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '1rem', fontSize: '0.8rem', color: '#94a3b8' }}>
                      {new Date(app.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <Link
                        to={`/reviewer/${app.id}`}
                        state={{ reviewerKey }}
                        style={{ color: '#2563eb', fontSize: '0.875rem', textDecoration: 'none', fontWeight: 500 }}
                      >
                        Review →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ padding: '0 2rem 2rem', fontSize: '0.75rem', color: '#94a3b8' }}>
        <strong>Rubric dimensions:</strong> {RUBRIC_DIMENSIONS.map((d) => d.label).join(' · ')} (each scored 1–5)
      </div>
    </div>
  );
}
