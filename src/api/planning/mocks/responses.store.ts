import {
  eventResponsesStorageKey,
  parseEventResponses,
} from '../../../features/planning/utils/eventResponses.ts';
import type { EventResponses } from '../../../types/planning/planning.types.ts';

let responses: EventResponses | undefined;
export function getMockResponses(): EventResponses {
  if (responses) {
    return responses;
  }
  try {
    responses = parseEventResponses(localStorage.getItem(eventResponsesStorageKey));
  } catch {
    responses = {};
  }
  return responses;
}
export function saveMockResponses(next: EventResponses) {
  responses = next;
  try {
    localStorage.setItem(eventResponsesStorageKey, JSON.stringify(next));
  } catch {
    /* Retain session decisions if browser storage is unavailable. */
  }
  return next;
}
