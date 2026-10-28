import type { PolicySection } from '../components/PolicyDocument.tsx';

export const privacySections: PolicySection[] = [
  {
    id: 'operator',
    title: 'Who is responsible',
    paragraphs: [
      'FrogFarmers is operated as a project prototype by the FrogFarmers team. Contact olehzpr@gmail.com for support or privacy requests.',
    ],
  },
  {
    id: 'demo-data',
    title: 'Data in the current demo',
    paragraphs: [
      'The current app has no connected authentication service, Google connection, or server-side user account. The account profile, field records, weather, and recommendations are sample data.',
      'Field names and crops entered in the demo are held in memory and reset on reload. The demo login does not verify credentials or send them to an authentication server. Do not enter real passwords.',
    ],
  },
  {
    id: 'browser-storage',
    title: 'Browser storage and retention',
    paragraphs: [
      'Your language preference and accepted or rejected field-plan events are stored locally in your browser until you clear this website’s stored data. They are not linked to a Google Account.',
      'The app does not currently store Google tokens, Google profile information, or Google Calendar events. Closing or reloading the app clears its in-memory demo field changes; saved browser preferences remain until removed.',
    ],
  },
  {
    id: 'google-use',
    title: 'Purpose of the planned Google connection',
    paragraphs: [
      'Google sign-in is intended only to identify you and associate you with your FrogFarmers account. Calendar access is optional and intended only to export field-plan actions you select to a dedicated FrogFarmers calendar.',
      'We will not use Google user data for advertising, sell it to data brokers, or use it to train general-purpose AI or machine-learning models. Google account and Calendar data will not be used to generate agronomic predictions.',
      'Any future access to or transfer of Google user data must follow the Google API Services User Data Policy, including its Limited Use restrictions.',
    ],
  },
  {
    id: 'sharing',
    title: 'Data sharing and service providers',
    paragraphs: [
      'The current demo sends no Google user data to any third party. If you later connect Google Calendar, exported field-plan information will be sent to Google to provide the calendar feature you request.',
      'Vercel delivers this website. When maps load, your browser also requests imagery from Esri. These providers receive technical connection information such as your IP address; map requests also identify the displayed map area. The demo does not request your device’s location.',
    ],
  },
  {
    id: 'security',
    title: 'Security and changes to this notice',
    paragraphs: [
      'Use the published HTTPS website. Do not send passwords or authorization tokens to our support email. No Google credentials or tokens are currently collected by this prototype.',
      'Before Google connections are enabled, this policy will be updated to describe the actual storage, retention periods, security controls, and service providers. If data use changes, the updated practices will be disclosed before new access is requested.',
    ],
  },
];

export const termsSections: PolicySection[] = [
  {
    id: 'service',
    title: 'About this service',
    paragraphs: [
      'FrogFarmers is a public demonstration of field management, crop-rotation exploration, and action planning. Its data and predictions are illustrative. Google sign-in and Calendar export are planned features and are not available in the current prototype.',
    ],
  },
  {
    id: 'responsible-use',
    title: 'Responsible use',
    paragraphs: [
      'Use the app lawfully and do not attempt to access other people’s accounts, disrupt the service, or submit content you are not entitled to use. Do not enter confidential production records or real credentials into the demo.',
    ],
  },
  {
    id: 'decisions',
    title: 'Field decisions and limitations',
    paragraphs: [
      'The app is provided for demonstration and exploration. Its sample forecasts and recommendations are not professional agronomic advice or a guarantee of field conditions, yields, or outcomes. Verify decisions using your own observations and qualified advice.',
    ],
  },
  {
    id: 'google-calendar',
    title: 'Optional Google Calendar connection',
    paragraphs: [
      'If the Calendar feature becomes available, you will choose whether to connect Google and which field-plan actions to export. Review event details and any field names before exporting. You can revoke Google access and manage the dedicated calendar in your Google Account.',
      'Disconnecting an app does not itself remove events or calendars already stored by Google. Google services are also governed by Google’s own terms and privacy policies.',
    ],
  },
  {
    id: 'availability',
    title: 'Availability and updates',
    paragraphs: [
      'The prototype may change or become unavailable. Demo field edits reset on reload, and browser-stored preferences can be lost when site data is cleared. Keep your own copies of important plans.',
      'Changes to these terms will be published on this page with an updated date. Questions about the service or these terms can be sent to the support email below.',
    ],
  },
];
