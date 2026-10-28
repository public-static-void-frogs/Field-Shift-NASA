import type {
  EventDecision,
  EventResponses,
  PlannedEvent,
} from '../types/planning/planning.types.ts';

export const eventResponsesStorageKey = 'frogfarmers:event-responses:v1';

// Responses apply to the reviewed schedule, not a later replacement with the same ID.
export function eventFingerprint(event: PlannedEvent): string {
  return JSON.stringify([
    event.id,
    event.fieldId,
    event.date,
    event.title,
    event.description,
    event.duration,
  ]);
}

export function getEventDecision(event: PlannedEvent, responses: EventResponses): EventDecision {
  const response = responses[event.id];
  return response?.fingerprint === eventFingerprint(event) ? response.status : 'proposed';
}

export function updateEventResponse(
  responses: EventResponses,
  event: PlannedEvent,
  status: EventDecision,
): EventResponses {
  const next = { ...responses };
  if (status === 'proposed') delete next[event.id];
  else next[event.id] = { status, fingerprint: eventFingerprint(event) };
  return next;
}

export function getCalendarEvents(
  events: PlannedEvent[],
  responses: EventResponses,
): PlannedEvent[] {
  return events.filter((event) => getEventDecision(event, responses) !== 'declined');
}

export function updateStrategyResponse(
  responses: EventResponses,
  events: PlannedEvent[],
  status: EventDecision,
): EventResponses {
  return events.reduce((next, event) => updateEventResponse(next, event, status), responses);
}

export function parseEventResponses(raw: string | null): EventResponses {
  try {
    const value: unknown = JSON.parse(raw ?? '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(
        ([, response]) =>
          response &&
          typeof response === 'object' &&
          (response.status === 'accepted' || response.status === 'declined') &&
          typeof response.fingerprint === 'string',
      ),
    );
  } catch {
    return {};
  }
}
