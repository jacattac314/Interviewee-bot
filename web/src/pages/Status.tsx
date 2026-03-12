/**
 * Interview status page — candidates can track their interview progress
 * and re-request the current question.
 */

import { useState, useEffect } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { api, ApplicationStatus } from '../api/client';

const STATE_LABELS: Record<string, { label: string; description: string; done: boolean }> = {
  PENDING:        { label: 'Pending',       description: 'Interview not yet started.',           done: false },
  HANDSHAKE:      { label: 'Verifying',     description: 'Verifying your endpoint.',             done: false },
  BACKGROUND:     { label: 'Background',    description: 'Asking about your background.',        done: false },
  COMPENSATION:   { label: 'Compensation',  description: 'Asking about salary expectations.',    done: false },
  ARCHITECTURE:   { label: 'Architecture',  description: 'Asking about your automation setup.',  done: false },
  DEBUG_SCENARIO: { label: 'Debugging',     description: 'Running a debugging scenario.',        done: false },
  CLOSE:          { label: 'Closing',       description: 'Final question.',                      done: false },
  DONE:           { label: 'Complete',      description: 'Interview complete! Awaiting review.', done: true  },
  TIMEOUT:        { label: 'Timed out',     description: 'Session expired. Contact us to reopen.', done: true },
  ERROR:          { label: 'Error',         description: 'Something went wrong. Contact us.',    done: true  },
};

const STEPS = ['HANDSHAKE','BACKGROUND','COMPENSATION','ARCHITECTURE','DEBUG_SCENARIO','CLOSE','DONE'];

export default function Status() {
  const { applicationId } = useParams<{ applicationId: string }>();
  const location = useLocation();
  const successMessage = (location.state as { message?: string } | null)?.message;

  const [status, setStatus] = useState<ApplicationStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryMessage, setRetryMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!applicationId) return;

    const load = async () => {
      try {
        const data = await api.getApplicationStatus(applicationId);
        setStatus(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load status');
      }
    };

    load();

    // Poll every 10s while not terminal
    const interval = setInterval(async () => {
      try {
        const data = await api.getApplicationStatus(applicationId!);
        setStatus(data);
        if (data.session?.state && STATE_LABELS[data.session.state]?.done) {
          clearInterval(interval);
        }
      } catch { /* silent */ }
    }, 10000);

    return () => clearInterval(interval);
  }, [applicationId]);

  async function handleRetry() {
    if (!applicationId) return;
    setRetrying(true);
    try {
      await api.retryQuestion(applicationId);
      setRetryMessage('Question re-sent! Check your messages.');
    } catch (err) {
      setRetryMessage(err instanceof Error ? err.message : 'Could not resend question');
    } finally {
      setRetrying(false);
    }
  }

  const sessionState = status?.session?.state ?? 'PENDING';
  const stateInfo = STATE_LABELS[sessionState] ?? STATE_LABELS.PENDING;
  const currentStepIndex = STEPS.indexOf(sessionState);

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem' }}>
      <div style={{ background: 'white', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', maxWidth: 560, width: '100%', padding: '2.5rem' }}>
        <h1 style={{ margin: '0 0 0.5rem', fontSize: '1.5rem' }}>Interview Status</h1>
        {status?.candidateName && (
          <p style={{ margin: '0 0 1.5rem', color: '#64748b' }}>Hi, {status.candidateName}!</p>
        )}

        {successMessage && (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1.5rem', color: '#166534', fontSize: '0.9rem' }}>
            {successMessage}
          </div>
        )}

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1.5rem', color: '#dc2626', fontSize: '0.9rem' }}>
            {error}
          </div>
        )}

        {status && (
          <>
            {/* Current status */}
            <div style={{ background: stateInfo.done ? '#f0fdf4' : '#eff6ff', borderRadius: 12, padding: '1.25rem', marginBottom: '1.5rem', textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>
                {stateInfo.done ? (sessionState === 'DONE' ? '✅' : '⚠️') : '⏳'}
              </div>
              <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#0f172a' }}>{stateInfo.label}</div>
              <div style={{ color: '#475569', fontSize: '0.9rem', marginTop: '0.25rem' }}>{stateInfo.description}</div>
            </div>

            {/* Progress bar */}
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                {STEPS.slice(0, -1).map((step, i) => (
                  <div
                    key={step}
                    style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: i <= currentStepIndex ? '#2563eb' : '#e2e8f0',
                      color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.75rem', fontWeight: 600, flexShrink: 0,
                    }}
                  >
                    {i < currentStepIndex ? '✓' : i + 1}
                  </div>
                ))}
              </div>
              <div style={{ height: 4, background: '#e2e8f0', borderRadius: 2, overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%', background: '#2563eb', borderRadius: 2,
                    width: `${Math.max(0, (currentStepIndex / (STEPS.length - 2)) * 100)}%`,
                    transition: 'width 0.5s ease',
                  }}
                />
              </div>
            </div>

            {/* Actions */}
            {!stateInfo.done && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <button
                  onClick={handleRetry}
                  disabled={retrying}
                  style={{
                    background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 8,
                    padding: '0.75rem', fontSize: '0.95rem', cursor: 'pointer', color: '#475569',
                  }}
                >
                  {retrying ? 'Resending…' : 'Re-send current question'}
                </button>
                {retryMessage && (
                  <div style={{ fontSize: '0.875rem', color: '#059669', textAlign: 'center' }}>
                    {retryMessage}
                  </div>
                )}
              </div>
            )}

            <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #f1f5f9', fontSize: '0.8rem', color: '#94a3b8' }}>
              Application ID: <code>{status.applicationId}</code>
              {status.session?.startedAt && (
                <> · Started {new Date(status.session.startedAt).toLocaleDateString()}</>
              )}
            </div>
          </>
        )}

        {!status && !error && (
          <div style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>Loading…</div>
        )}
      </div>
    </div>
  );
}
