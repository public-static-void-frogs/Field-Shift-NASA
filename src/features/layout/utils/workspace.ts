import type { AppRouteHandle } from '../../../app/routes.ts';

export function getWorkspaceClassName(workspace: AppRouteHandle['workspace']) {
  if (workspace === 'map' || workspace === 'calendar') {
    return 'main-content main-content-map';
  }
  if (workspace === 'fields') {
    return 'main-content main-content-fields';
  }
  return 'main-content';
}
