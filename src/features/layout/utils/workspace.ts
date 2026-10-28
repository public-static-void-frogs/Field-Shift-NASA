import type { AppRouteHandle } from '../../../types/shared/router.types.ts';

export function getWorkspaceClassName(workspace: AppRouteHandle['workspace']) {
  if (workspace === 'map' || workspace === 'calendar') {
    return 'main-content main-content-map';
  }
  if (workspace === 'fields') {
    return 'main-content main-content-fields';
  }
  return 'main-content';
}
