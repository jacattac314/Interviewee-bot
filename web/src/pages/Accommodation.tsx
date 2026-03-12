/**
 * Accommodation request page for candidates who cannot use the
 * SMS or email automation interview endpoint.
 */

import { useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';

export default function Accommodation() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [applicationId, setApplicationId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.requestAccommodation({
        name: name.trim(),
        email: email.trim(),
        message: message.trim(),
        applicationId: applicationId.trim() || undefined,
      });
      setSuccess(result.message || 'Your request has been received. We will reach out within 1 business day.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.75rem',
    border: '1.5px solid #e2e8f0',
    borderRadius: 8,
    fontSize: '1rem',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: '#374151',
    marginBottom: '0.4rem',
  };

  const fieldStyle: React.CSSProperties = {
    marginBottom: '1.25rem',
  };

  if (success) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
        <div style={{ background: 'white', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: '2.5rem', maxWidth: 480, width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>✓</div>
          <h2 style={{ margin: '0 0 0.75rem', color: '#059669' }}>Request Received</h2>
          <p style={{ color: '#475569', margin: '0 0 1.5rem' }}>{success}</p>
          <Link to="/apply" style={{ color: '#2563eb', fontWeight: 500, textDecoration: 'none' }}>← Back to Apply</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem' }}>
      <div style={{ background: 'white', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: '2.5rem', maxWidth: 520, width: '100%' }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <Link to="/apply" style={{ color: '#64748b', fontSize: '0.875rem', textDecoration: 'none' }}>← Back to Apply</Link>
        </div>

        <h1 style={{ margin: '0 0 0.75rem', fontSize: '1.5rem', color: '#1e293b' }}>Request Interview Accommodation</h1>
        <p style={{ margin: '0 0 1.75rem', color: '#475569', lineHeight: 1.6 }}>
          If you cannot use an SMS or email automation endpoint, we can arrange a human-led
          interview. Complete this form and we'll reach out within 1 business day.
        </p>

        <form onSubmit={handleSubmit}>
          <div style={fieldStyle}>
            <label htmlFor="acc-name" style={labelStyle}>Full name</label>
            <input
              id="acc-name"
              type="text"
              placeholder="Alex Rivera"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              style={inputStyle}
            />
          </div>

          <div style={fieldStyle}>
            <label htmlFor="acc-email" style={labelStyle}>Email address</label>
            <input
              id="acc-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={inputStyle}
            />
          </div>

          <div style={fieldStyle}>
            <label htmlFor="acc-message" style={labelStyle}>Message</label>
            <textarea
              id="acc-message"
              placeholder="Describe the accommodation you need and any relevant details…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              rows={5}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>

          <div style={fieldStyle}>
            <label htmlFor="acc-appid" style={labelStyle}>Application ID (optional)</label>
            <input
              id="acc-appid"
              type="text"
              placeholder="If you already have an application ID"
              value={applicationId}
              onChange={(e) => setApplicationId(e.target.value)}
              style={inputStyle}
            />
          </div>

          {error && (
            <div style={{ color: '#dc2626', fontSize: '0.875rem', marginBottom: '1rem', background: '#fef2f2', padding: '0.75rem', borderRadius: 8 }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            style={{
              width: '100%',
              background: submitting ? '#93c5fd' : '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              padding: '0.875rem',
              fontSize: '1rem',
              fontWeight: 600,
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? 'Submitting…' : 'Submit accommodation request'}
          </button>
        </form>
      </div>
    </div>
  );
}
