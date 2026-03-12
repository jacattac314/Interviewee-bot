/**
 * Admin panel — metrics, job requisitions, and reviewer management.
 * Protected by the same reviewerKey as the Dashboard.
 */

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';

type Metrics = {
  applications: { total: number; completed: number; advanced: number; rejected: number };
  webhooks: Array<{ provider: string; status: string; count: number }>;
};

type Requisition = { id: string; title: string; isActive: boolean };
type Reviewer = { id: string; name: string; email: string; role: string };

export default function Admin() {
  const [reviewerKey, setReviewerKey] = useState(localStorage.getItem('reviewerKey') ?? '');
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Metrics
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [metricsError, setMetricsError] = useState<string | null>(null);

  // Requisitions
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [reqError, setReqError] = useState<string | null>(null);
  const [newReqTitle, setNewReqTitle] = useState('');
  const [reqSubmitting, setReqSubmitting] = useState(false);
  const [reqSuccess, setReqSuccess] = useState<string | null>(null);

  // Reviewers
  const [reviewers, setReviewers] = useState<Reviewer[]>([]);
  const [revError, setRevError] = useState<string | null>(null);
  const [newRevName, setNewRevName] = useState('');
  const [newRevEmail, setNewRevEmail] = useState('');
  const [newRevRole, setNewRevRole] = useState<'HIRING_MANAGER' | 'RECRUITER'>('RECRUITER');
  const [revSubmitting, setRevSubmitting] = useState(false);
  const [revSuccess, setRevSuccess] = useState<string | null>(null);

  const loadAll = useCallback(async (key: string) => {
    setMetricsError(null);
    setReqError(null);
    setRevError(null);
    try {
      const m = await api.getMetrics(key);
      setMetrics(m);
      setAuthed(true);
    } catch (err) {
      setMetricsError(err instanceof Error ? err.message : 'Failed to load metrics');
      setAuthed(false);
      setAuthError(err instanceof Error ? err.message : 'Invalid key');
      return;
    }
    try {
      const reqs = await api.getRequisitions(key);
      setRequisitions(reqs);
    } catch (err) {
      setReqError(err instanceof Error ? err.message : 'Failed to load requisitions');
    }
    try {
      const revs = await api.getReviewers(key);
      setReviewers(revs);
    } catch (err) {
      setRevError(err instanceof Error ? err.message : 'Failed to load reviewers');
    }
  }, []);

  function handleKeySubmit(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    localStorage.setItem('reviewerKey', reviewerKey);
    loadAll(reviewerKey);
  }

  async function handleAddRequisition(e: React.FormEvent) {
    e.preventDefault();
    if (!newReqTitle.trim()) return;
    setReqSubmitting(true);
    setReqSuccess(null);
    setReqError(null);
    try {
      const created = await api.createRequisition(reviewerKey, newReqTitle.trim());
      setRequisitions((prev) => [...prev, { id: created.id, title: created.title, isActive: true }]);
      setNewReqTitle('');
      setReqSuccess(`Requisition "${created.title}" created.`);
    } catch (err) {
      setReqError(err instanceof Error ? err.message : 'Failed to create requisition');
    } finally {
      setReqSubmitting(false);
    }
  }

  async function handleAddReviewer(e: React.FormEvent) {
    e.preventDefault();
    if (!newRevName.trim() || !newRevEmail.trim()) return;
    setRevSubmitting(true);
    setRevSuccess(null);
    setRevError(null);
    try {
      const created = await api.createReviewer(reviewerKey, newRevName.trim(), newRevEmail.trim(), newRevRole);
      setReviewers((prev) => [...prev, { id: created.id, name: created.name, email: created.email, role: newRevRole }]);
      setNewRevName('');
      setNewRevEmail('');
      setRevSuccess(`Reviewer "${created.name}" added.`);
    } catch (err) {
      setRevError(err instanceof Error ? err.message : 'Failed to add reviewer');
    } finally {
      setRevSubmitting(false);
    }
  }

  // Auto-load if key already stored
  useEffect(() => {
    if (reviewerKey) loadAll(reviewerKey);
  }, []); // eslint-disable-line

  const inputStyle: React.CSSProperties = {
    padding: '0.6rem 0.75rem',
    border: '1.5px solid #e2e8f0',
    borderRadius: 8,
    fontSize: '0.9rem',
    flex: 1,
    minWidth: 0,
  };

  const btnPrimary: React.CSSProperties = {
    background: '#2563eb',
    color: 'white',
    border: 'none',
    borderRadius: 8,
    padding: '0.6rem 1.1rem',
    fontSize: '0.9rem',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  };

  const cardStyle: React.CSSProperties = {
    background: 'white',
    borderRadius: 12,
    boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
    padding: '1.5rem',
    marginBottom: '1.5rem',
  };

  const sectionTitle: React.CSSProperties = {
    margin: '0 0 1rem',
    fontSize: '1.1rem',
    fontWeight: 700,
    color: '#1e293b',
  };

  if (!authed) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
        <div style={{ background: 'white', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: '2.5rem', maxWidth: 400, width: '100%' }}>
          <h2 style={{ margin: '0 0 0.25rem' }}>Admin Panel</h2>
          <p style={{ margin: '0 0 1.5rem', color: '#64748b', fontSize: '0.875rem' }}>Enter your reviewer key to access admin tools.</p>
          <form onSubmit={handleKeySubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <input
              type="password"
              placeholder="Reviewer API key"
              value={reviewerKey}
              onChange={(e) => setReviewerKey(e.target.value)}
              style={{ padding: '0.75rem', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '1rem' }}
            />
            {authError && <div style={{ color: '#dc2626', fontSize: '0.875rem' }}>{authError}</div>}
            <button type="submit" style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: 8, padding: '0.75rem', fontSize: '1rem', cursor: 'pointer' }}>
              Access admin panel
            </button>
          </form>
          <div style={{ marginTop: '1rem', textAlign: 'center' }}>
            <Link to="/reviewer" style={{ color: '#2563eb', fontSize: '0.875rem' }}>← Back to Dashboard</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <header style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '1rem 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.25rem' }}>Admin Panel</h1>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: '#64748b' }}>Metrics, requisitions, and reviewer management</p>
        </div>
        <Link to="/reviewer" style={{ color: '#2563eb', fontSize: '0.875rem', textDecoration: 'none', fontWeight: 500 }}>
          ← Back to Dashboard
        </Link>
      </header>

      <div style={{ padding: '1.5rem 2rem', maxWidth: 960, margin: '0 auto' }}>

        {/* ── Metrics ── */}
        <div style={cardStyle}>
          <h2 style={sectionTitle}>Metrics</h2>
          {metricsError && <div style={{ color: '#dc2626', marginBottom: '1rem' }}>{metricsError}</div>}
          {metrics && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                {[
                  { label: 'Total', value: metrics.applications.total, color: '#2563eb' },
                  { label: 'Completed', value: metrics.applications.completed, color: '#3b82f6' },
                  { label: 'Advanced', value: metrics.applications.advanced, color: '#10b981' },
                  { label: 'Rejected', value: metrics.applications.rejected, color: '#ef4444' },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ background: '#f8fafc', borderRadius: 10, padding: '1rem', textAlign: 'center', border: `2px solid ${color}20` }}>
                    <div style={{ fontSize: '2rem', fontWeight: 800, color }}>{value}</div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                  </div>
                ))}
              </div>

              {metrics.webhooks.length > 0 && (
                <>
                  <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Webhook Signature Status
                  </h3>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                        {['Provider', 'Status', 'Count'].map((h) => (
                          <th key={h} style={{ padding: '0.6rem 0.75rem', textAlign: 'left', color: '#64748b', fontWeight: 600, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.webhooks.map((w, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '0.6rem 0.75rem', fontWeight: 500 }}>{w.provider}</td>
                          <td style={{ padding: '0.6rem 0.75rem' }}>
                            <span style={{
                              background: w.status === 'ok' ? '#d1fae5' : '#fee2e2',
                              color: w.status === 'ok' ? '#059669' : '#dc2626',
                              padding: '0.2rem 0.5rem', borderRadius: 999, fontSize: '0.75rem', fontWeight: 600,
                            }}>
                              {w.status}
                            </span>
                          </td>
                          <td style={{ padding: '0.6rem 0.75rem', color: '#475569' }}>{w.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </>
          )}
        </div>

        {/* ── Job Requisitions ── */}
        <div style={cardStyle}>
          <h2 style={sectionTitle}>Job Requisitions</h2>
          {reqError && <div style={{ color: '#dc2626', marginBottom: '1rem' }}>{reqError}</div>}
          {reqSuccess && <div style={{ color: '#059669', marginBottom: '1rem' }}>{reqSuccess}</div>}

          {requisitions.length === 0 && !reqError && (
            <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginBottom: '1rem' }}>No requisitions yet.</p>
          )}
          {requisitions.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1.25rem' }}>
              {requisitions.map((req) => (
                <li key={req.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ fontWeight: 500, flex: 1 }}>{req.title}</span>
                  <span style={{
                    background: req.isActive ? '#d1fae5' : '#f1f5f9',
                    color: req.isActive ? '#059669' : '#94a3b8',
                    padding: '0.2rem 0.5rem', borderRadius: 999, fontSize: '0.75rem', fontWeight: 600,
                  }}>
                    {req.isActive ? 'Active' : 'Inactive'}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={handleAddRequisition} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="New requisition title"
              value={newReqTitle}
              onChange={(e) => setNewReqTitle(e.target.value)}
              required
              style={inputStyle}
            />
            <button type="submit" disabled={reqSubmitting} style={btnPrimary}>
              {reqSubmitting ? 'Adding…' : 'Add Requisition'}
            </button>
          </form>
        </div>

        {/* ── Reviewers ── */}
        <div style={cardStyle}>
          <h2 style={sectionTitle}>Reviewers</h2>
          {revError && <div style={{ color: '#dc2626', marginBottom: '1rem' }}>{revError}</div>}
          {revSuccess && <div style={{ color: '#059669', marginBottom: '1rem' }}>{revSuccess}</div>}

          {reviewers.length === 0 && !revError && (
            <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginBottom: '1rem' }}>No reviewers found.</p>
          )}
          {reviewers.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  {['Name', 'Email', 'Role'].map((h) => (
                    <th key={h} style={{ padding: '0.6rem 0.75rem', textAlign: 'left', color: '#64748b', fontWeight: 600, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reviewers.map((rev, i) => (
                  <tr key={rev.id} style={{ borderBottom: i < reviewers.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                    <td style={{ padding: '0.6rem 0.75rem', fontWeight: 500 }}>{rev.name}</td>
                    <td style={{ padding: '0.6rem 0.75rem', color: '#475569' }}>{rev.email}</td>
                    <td style={{ padding: '0.6rem 0.75rem' }}>
                      <span style={{
                        background: rev.role === 'HIRING_MANAGER' ? '#eff6ff' : '#f0fdf4',
                        color: rev.role === 'HIRING_MANAGER' ? '#1d4ed8' : '#15803d',
                        padding: '0.2rem 0.5rem', borderRadius: 999, fontSize: '0.75rem', fontWeight: 600,
                      }}>
                        {rev.role.replace('_', ' ')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <form onSubmit={handleAddReviewer} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Name"
              value={newRevName}
              onChange={(e) => setNewRevName(e.target.value)}
              required
              style={{ ...inputStyle, minWidth: 140 }}
            />
            <input
              type="email"
              placeholder="Email"
              value={newRevEmail}
              onChange={(e) => setNewRevEmail(e.target.value)}
              required
              style={{ ...inputStyle, minWidth: 180 }}
            />
            <select
              value={newRevRole}
              onChange={(e) => setNewRevRole(e.target.value as 'HIRING_MANAGER' | 'RECRUITER')}
              style={{ padding: '0.6rem 0.75rem', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '0.9rem', background: 'white' }}
            >
              <option value="RECRUITER">Recruiter</option>
              <option value="HIRING_MANAGER">Hiring Manager</option>
            </select>
            <button type="submit" disabled={revSubmitting} style={btnPrimary}>
              {revSubmitting ? 'Adding…' : 'Add Reviewer'}
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}
