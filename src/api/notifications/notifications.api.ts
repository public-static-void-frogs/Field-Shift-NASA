import type { FarmNotification } from '../../types/notifications/notification.types.ts';
import { mockResponse } from '../core/mock-response.ts';
import { getMockNotifications } from './mocks/notifications.mock.ts';

export const notificationsApi = {
  getAll: (signal?: AbortSignal): Promise<FarmNotification[]> =>
    mockResponse(getMockNotifications, signal),
};
