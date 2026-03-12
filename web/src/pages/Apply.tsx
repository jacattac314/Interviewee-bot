/**
 * Candidate application page.
 *
 * Explains the automation-interview format, collects channel + endpoint,
 * records consent, and starts the interview session.
 */

import { useState, FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../api/client';
import styles from './Apply.module.css';

const CONSENT_TEXT_SMS = `By submitting this form, you consent to receive automated interview messages via SMS from Fairly. Message and data rates may apply. Reply STOP to opt out at any time. AI tools may be used to extract structured data from your replies; humans make all hiring decisions.`;
const CONSENT_TEXT_EMAIL = `By submitting this form, you consent to receive automated interview emails from Fairly. You may unsubscribe at any time. AI tools may be used to extract structured data from your replies; humans make all hiring decisions.`;

export default function Apply() {
  const navigate = useNavigate();
  const [channel, setChannel] = useState<'SMS' | 'EMAIL'>('SMS');
  const [endpointValue, setEndpointValue] = useState('');
  const [candidateName, setCandidateName] = useState('');
  const [location, setLocation] = useState('');
  const [consentGiven, setConsentGiven] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!consentGiven) {
      setError('You must agree to the consent terms to proceed.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const result = await api.submitApplication({
        channel,
        endpointValue,
        consentGiven,
        candidateName: candidateName || undefined,
        location: location || undefined,
      });
      navigate(`/status/${result.applicationId}`, { state: { message: result.message } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <span className={styles.badge}>AI Operations Analyst</span>
          <h1>Apply via Automation</h1>
          <p className={styles.lead}>
            We don't review resumes — we interview your automation.
            Submit an SMS number or email address connected to an automation
            you've built, and we'll conduct a structured interview through it.
          </p>
        </div>

        <div className={styles.howItWorks}>
          <h2>How it works</h2>
          <ol>
            <li>
              <strong>Build an automation</strong> — set up a Zapier Catch Hook, n8n webhook,
              or any endpoint that can receive and reply to messages.
            </li>
            <li>
              <strong>Submit your endpoint</strong> — phone number (SMS) or email address.
            </li>
            <li>
              <strong>We interview your bot</strong> — structured questions about your background,
              salary expectations, and the architecture of what you built.
            </li>
            <li>
              <strong>Humans review</strong> — a hiring manager reads your transcript and decides.
            </li>
          </ol>
          <p className={styles.note}>
            <strong>Notice:</strong> AI tools may be used to extract structured data from your
            responses. All hiring decisions are made by humans. An accommodation path is available
            — contact us if you need an alternative format.
          </p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label>Preferred channel</label>
            <div className={styles.channelButtons}>
              <button
                type="button"
                className={channel === 'SMS' ? styles.channelActive : styles.channelInactive}
                onClick={() => { setChannel('SMS'); setEndpointValue(''); }}
              >
                📱 SMS
              </button>
              <button
                type="button"
                className={channel === 'EMAIL' ? styles.channelActive : styles.channelInactive}
                onClick={() => { setChannel('EMAIL'); setEndpointValue(''); }}
              >
                ✉️ Email
              </button>
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="endpointValue">
              {channel === 'SMS' ? 'Phone number (E.164 format, e.g. +13125551234)' : 'Email address'}
            </label>
            <input
              id="endpointValue"
              type={channel === 'EMAIL' ? 'email' : 'tel'}
              placeholder={channel === 'SMS' ? '+13125551234' : 'you@example.com'}
              value={endpointValue}
              onChange={(e) => setEndpointValue(e.target.value)}
              required
              className={styles.input}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="candidateName">Your name (optional, but recommended)</label>
            <input
              id="candidateName"
              type="text"
              placeholder="Alex Rivera"
              value={candidateName}
              onChange={(e) => setCandidateName(e.target.value)}
              className={styles.input}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="location">Location / time zone (optional)</label>
            <input
              id="location"
              type="text"
              placeholder="US-Remote, EST"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className={styles.input}
            />
          </div>

          <div className={styles.consentBox}>
            <label className={styles.consentLabel}>
              <input
                type="checkbox"
                checked={consentGiven}
                onChange={(e) => setConsentGiven(e.target.checked)}
                required
              />
              <span>
                {channel === 'SMS' ? CONSENT_TEXT_SMS : CONSENT_TEXT_EMAIL}
              </span>
            </label>
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <button
            type="submit"
            disabled={submitting}
            className={styles.submitButton}
          >
            {submitting ? 'Starting interview…' : 'Start automation interview →'}
          </button>
        </form>

        <div className={styles.footer}>
          <p>
            <strong>Need an accommodation?</strong> If you cannot use SMS or email automation,{' '}
            <Link to="/accommodation">request an accommodation</Link> to arrange a human-led interview alternative.
          </p>
        </div>
      </div>
    </div>
  );
}
