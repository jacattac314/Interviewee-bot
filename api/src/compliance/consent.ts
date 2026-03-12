// Versioned consent text. Increment version when text changes.
// The version string is stored in ConsentEvent.consentTextVersion.

export const CONSENT_VERSIONS = {
  'v1-2024': {
    sms: `By proceeding, you consent to receive automated SMS interview messages from Fairly (the hiring company). Message and data rates may apply. Reply STOP at any time to opt out; reply HELP for assistance. AI tools extract structured data from your replies; all hiring decisions are made by humans. Data retained for 12 months. Accommodation available at hiring@fairly.com.`,
    email: `By proceeding, you consent to receive automated email interview messages from Fairly. You may unsubscribe at any time. AI tools extract structured data from your replies; all hiring decisions are made by humans. Data retained for 12 months. Contact hiring@fairly.com for accommodations or data rights requests.`,
  },
} as const;

export type ConsentVersion = keyof typeof CONSENT_VERSIONS;
export const CURRENT_CONSENT_VERSION: ConsentVersion = 'v1-2024';

export function getConsentText(version: ConsentVersion, channel: 'sms' | 'email'): string {
  return CONSENT_VERSIONS[version][channel];
}
