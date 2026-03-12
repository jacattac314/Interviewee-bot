/**
 * Candidate review page — full transcript, extracted fields, rubric scoring,
 * and action buttons (advance/reject/sync ATS).
 */

import { useState, useEffect } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { api, CandidatePacket } from '../api/client';

const RUBRIC_DIMENSIONS = [
  { key: 'api_webhook_literacy', label: 'API / Webhook Literacy', description: 'Signature validation, retry logic, error codes' },
  { key: 'automation_design',    label: 'Automation Design Quality', description: 'Modularity, observability, failure handling' },
  { key: 'llm_prompt_craft',     label: 'LLM / Prompt Craft',        description: 'Structured outputs, edge case handling' },
  { key: 'debugging_approach',   label: 'Debugging Approach',         description: 'Schema drift handling, monitoring tooling' },
  { key: 'communication',        label: 'Communication Clarity',      description: 'Concise, machine-readable responses' },
];

type Tab = 'summary' | 'transcript' | 'tests' | 'scoring' | 'audit';

export default function Review() {
  const { applicationId } = useParams<{ applicationId: string }>();
  const location = useLocation();
  const reviewerKey = (location.state as { reviewerKey?: string } | null)?.reviewerKey
    ?? localStorage.getItem('reviewerKey') ?? '';

  const [packet, setPacket] = useState<CandidatePacket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('summary');

  // Scoring state
  const [scores, setScores] = useState<Record<string, number>>({});
  const [rationale, setRationale] = useState<Record<string, string>>({});
  const [reviewerId] = useState(() => `reviewer-${Date.now()}`);
  const [scoreMsg, setScoreMsg] = useState<string | null>(null);

  // Action state
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!applicationId || !reviewerKey) return;
    api.getApplication(reviewerKey, applicationId)
      .then(setPacket)
      .catch((err: Error) => setError(err.message));
  }, [applicationId, reviewerKey]);

  async function handleScore() {
    if (!applicationId) return;
    const scoreList = RUBRIC_DIMENSIONS
      .filter((d) => scores[d.key] !== undefined)
      .map((d) => ({ dimension: d.key, score: scores[d.key], rationale: rationale[d.key] }));
    if (scoreList.length === 0) return;
    try {
      await api.submitScores(reviewerKey, applicationId, reviewerId, scoreList);
      setScoreMsg('Scores saved!');
    } catch (err) {
      setScoreMsg(err instanceof Error ? err.message : 'Save failed');
    }
  }

  async function handleAdvance() {
    if (!applicationId) return;
    await api.advanceCandidate(reviewerKey, applicationId, reviewerId);
    setActionMsg('Candidate advanced!');
  }

  async function handleReject() {
    if (!applicationId) return;
    await api.rejectCandidate(reviewerKey, applicationId, reviewerId, 'reviewer_decision');
    setActionMsg('Candidate rejected.');
  }

  async function handleSync(provider: 'greenhouse' | 'lever') {
    if (!applicationId) return;
    try {
      await api.syncAts(reviewerKey, applicationId, provider);
      setActionMsg(`Synced to ${provider}!`);
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : 'Sync failed');
    }
  }

  if (error) return <div style={{ padding: '2rem', color: '#dc2626' }}>Error: {error}</div>;
  if (!packet) return <div style={{ padding: '2rem', color: '#94a3b8' }}>Loading…</div>;

  const ex = packet.extracted;

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      {/* Header */}
      <header style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '1rem 2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.25rem' }}>{packet.candidate.name ?? 'Unknown Candidate'}</h1>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: '#64748b' }}>
              {packet.candidate.email ?? packet.candidate.phone} · {packet.candidate.location ?? 'Location unknown'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button onClick={handleAdvance} style={{ background: '#10b981', color: 'white', border: 'none', borderRadius: 8, padding: '0.5rem 1rem', cursor: 'pointer', fontWeight: 600 }}>
              Advance ✓
            </button>
            <button onClick={handleReject} style={{ background: '#ef4444', color: 'white', border: 'none', borderRadius: 8, padding: '0.5rem 1rem', cursor: 'pointer', fontWeight: 600 }}>
              Reject ✗
            </button>
            <button onClick={() => handleSync('greenhouse')} style={{ background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 8, padding: '0.5rem 1rem', cursor: 'pointer', color: '#475569' }}>
              → Greenhouse
            </button>
            <button onClick={() => handleSync('lever')} style={{ background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 8, padding: '0.5rem 1rem', cursor: 'pointer', color: '#475569' }}>
              → Lever
            </button>
          </div>
        </div>
        {actionMsg && <div style={{ marginTop: '0.75rem', color: '#059669', fontSize: '0.875rem' }}>{actionMsg}</div>}
      </header>

      {/* Tabs */}
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '0 2rem', display: 'flex', gap: '1.5rem' }}>
        {(['summary', 'transcript', 'tests', 'scoring', 'audit'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '0.75rem 0',
              borderBottom: tab === t ? '2px solid #2563eb' : '2px solid transparent',
              color: tab === t ? '#2563eb' : '#64748b', fontWeight: tab === t ? 600 : 400,
              fontSize: '0.9rem', textTransform: 'capitalize',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      <div style={{ padding: '1.5rem 2rem', maxWidth: 960, margin: '0 auto' }}>
        {/* Summary tab */}
        {tab === 'summary' && (
          <div style={{ display: 'grid', gap: '1.5rem' }}>
            <Section title="Background">
              <Field label="Summary" value={ex.summary as string} />
              <Field label="Years experience" value={String(ex.years_experience_total ?? '—')} />
              <Field label="Automation tools" value={(ex.automation_tools as string[] | undefined)?.join(', ')} />
              <Field label="SQL comfort" value={ex.sql_comfort as string} />
            </Section>

            <Section title="Compensation">
              {ex.salary && (() => {
                const s = ex.salary as Record<string, unknown>;
                return <Field label="Salary target" value={`${s.min}–${s.max} ${s.currency} / ${s.cadence}`} />;
              })()}
            </Section>

            <Section title="Automation Architecture">
              <Field label="Orchestrator" value={ex.orchestrator as string} />
              <Field label="Trigger" value={ex.trigger as string} />
              {ex.llm && (() => {
                const l = ex.llm as Record<string, unknown>;
                return <Field label="LLM" value={l.used ? `${l.provider} — ${l.why}` : 'Not used'} />;
              })()}
              {ex.error_handling && (
                <Field label="Error handling" value={JSON.stringify(ex.error_handling)} mono />
              )}
              {ex.data_storage && (
                <Field label="Data storage" value={JSON.stringify(ex.data_storage)} mono />
              )}
              {(ex.links as string[] | undefined)?.length ? (
                <Field label="Links" value={(ex.links as string[]).join('\n')} />
              ) : null}
            </Section>

            <Section title="Debugging Approach">
              {(ex.debug_plan as string[] | undefined) && (
                <ol style={{ margin: 0, paddingLeft: '1.25rem', color: '#334155', lineHeight: 1.7 }}>
                  {(ex.debug_plan as string[]).map((step, i) => <li key={i}>{step}</li>)}
                </ol>
              )}
            </Section>

            {ex.closing && <Section title="Closing Statement"><p style={{ margin: 0, color: '#334155' }}>{ex.closing as string}</p></Section>}
          </div>
        )}

        {/* Transcript tab */}
        {tab === 'transcript' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {(packet.transcript ?? []).map((msg, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: msg.direction === 'OUTBOUND' ? 'flex-start' : 'flex-end',
                }}
              >
                <div style={{
                  maxWidth: '75%',
                  background: msg.direction === 'OUTBOUND' ? '#f1f5f9' : '#eff6ff',
                  borderRadius: msg.direction === 'OUTBOUND' ? '4px 12px 12px 12px' : '12px 4px 12px 12px',
                  padding: '0.75rem 1rem',
                  fontSize: '0.875rem',
                  color: '#1e293b',
                  whiteSpace: 'pre-wrap',
                }}>
                  <div style={{ fontWeight: 600, fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
                    {msg.direction === 'OUTBOUND' ? 'System' : 'Candidate'} · {msg.channel} · {new Date(msg.at).toLocaleTimeString()}
                  </div>
                  {msg.body}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Automation tests tab */}
        {tab === 'tests' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {(packet.automation_tests ?? []).map((t, i) => (
              <div key={i} style={{ background: 'white', borderRadius: 12, padding: '1.25rem', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{t.type.replace(/_/g, ' ')}</div>
                  {t.latency_ms && <div style={{ fontSize: '0.85rem', color: '#64748b' }}>{t.latency_ms}ms</div>}
                </div>
                <span style={{
                  padding: '0.3rem 0.8rem', borderRadius: 999, fontWeight: 700, fontSize: '0.85rem',
                  background: t.result === 'PASS' ? '#dcfce7' : t.result === 'FAIL' ? '#fee2e2' : '#fef3c7',
                  color: t.result === 'PASS' ? '#166534' : t.result === 'FAIL' ? '#dc2626' : '#92400e',
                }}>
                  {t.result}
                </span>
              </div>
            ))}
            {(!packet.automation_tests || packet.automation_tests.length === 0) && (
              <div style={{ color: '#94a3b8', textAlign: 'center', padding: '2rem' }}>No automation tests run yet.</div>
            )}
          </div>
        )}

        {/* Scoring tab */}
        {tab === 'scoring' && (
          <div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {RUBRIC_DIMENSIONS.map((dim) => (
                <div key={dim.key} style={{ background: 'white', borderRadius: 12, padding: '1.25rem', border: '1px solid #e2e8f0' }}>
                  <div style={{ marginBottom: '0.75rem' }}>
                    <div style={{ fontWeight: 600 }}>{dim.label}</div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{dim.description}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    {[1,2,3,4,5].map((n) => (
                      <button
                        key={n}
                        onClick={() => setScores((prev) => ({ ...prev, [dim.key]: n }))}
                        style={{
                          width: 40, height: 40, borderRadius: 8, border: '1.5px solid',
                          borderColor: scores[dim.key] === n ? '#2563eb' : '#e2e8f0',
                          background: scores[dim.key] === n ? '#eff6ff' : 'white',
                          color: scores[dim.key] === n ? '#1d4ed8' : '#64748b',
                          fontWeight: 700, cursor: 'pointer',
                        }}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <textarea
                    placeholder="Rationale (optional)"
                    value={rationale[dim.key] ?? ''}
                    onChange={(e) => setRationale((prev) => ({ ...prev, [dim.key]: e.target.value }))}
                    style={{ width: '100%', padding: '0.5rem', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '0.875rem', resize: 'vertical', minHeight: 60 }}
                  />
                </div>
              ))}
            </div>

            <button
              onClick={handleScore}
              style={{ marginTop: '1.5rem', background: '#2563eb', color: 'white', border: 'none', borderRadius: 10, padding: '0.75rem 2rem', fontSize: '1rem', fontWeight: 600, cursor: 'pointer' }}
            >
              Save scores
            </button>
            {scoreMsg && <div style={{ marginTop: '0.75rem', color: '#059669', fontSize: '0.875rem' }}>{scoreMsg}</div>}

            {/* Existing scores */}
            {packet.rubric.evaluations.length > 0 && (
              <div style={{ marginTop: '2rem' }}>
                <h3 style={{ marginBottom: '1rem', fontSize: '1rem' }}>Previous evaluations</h3>
                {packet.rubric.evaluations.map((ev) => (
                  <div key={ev.id} style={{ background: 'white', borderRadius: 12, padding: '1rem', border: '1px solid #e2e8f0', marginBottom: '0.75rem' }}>
                    {ev.scores.map((s) => (
                      <div key={s.dimension} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.875rem' }}>
                        <span>{s.dimension}</span>
                        <span style={{ fontWeight: 700 }}>{s.score}/5</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Audit tab */}
        {tab === 'audit' && (
          <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  {['Time', 'Actor', 'Action', 'Details'].map((h) => (
                    <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                    Audit log visible in reviewer API export.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
      <div style={{ padding: '0.75rem 1.25rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontWeight: 600, fontSize: '0.9rem' }}>{title}</div>
      <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>{children}</div>
    </div>
  );
}

function Field({ label, value, mono = false }: { label: string; value?: string | null; mono?: boolean }) {
  if (!value) return null;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: '0.5rem', fontSize: '0.875rem' }}>
      <span style={{ color: '#64748b', fontWeight: 500 }}>{label}</span>
      <span style={{ color: '#1e293b', fontFamily: mono ? 'monospace' : undefined, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{value}</span>
    </div>
  );
}
