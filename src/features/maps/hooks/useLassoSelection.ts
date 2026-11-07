import { polygon, svg } from 'leaflet';
import { useEffect, useState } from 'react';
import { useMapEvents } from 'react-leaflet';
import type { CatalogFeature } from '../../../types/maps/map.types.ts';
import { getLassoFieldIds, isValidLasso, type ScreenPoint } from '../utils/lassoSelection.ts';
import type { SectionCoordinate } from '../utils/sectionSelection.ts';

type UseLassoSelectionOptions = {
  features: CatalogFeature[];
  available: boolean;
  onComplete: (outline: SectionCoordinate[], fields: CatalogFeature[]) => void;
  onToggle: (feature: CatalogFeature) => void;
};

export function useLassoSelection({
  features,
  available,
  onComplete,
  onToggle,
}: UseLassoSelectionOptions) {
  const [armed, setArmed] = useState(false);
  const map = useMapEvents({
    movestart: () => setArmed(false),
    resize: () => setArmed(false),
  });
  const active = armed && available;
  useEffect(() => {
    if (!active) {
      return;
    }
    const container = map.getContainer();
    const handlers = [
      map.dragging,
      map.boxZoom,
      map.doubleClickZoom,
      map.scrollWheelZoom,
      map.touchZoom,
      map.keyboard,
    ];
    const enabledHandlers = handlers.filter((handler) => handler.enabled());
    enabledHandlers.forEach((handler) => handler.disable());
    const oldTouchAction = container.style.touchAction;
    container.style.touchAction = 'none';
    container.classList.add('map-lasso-active');
    const renderer = svg();
    const outline = polygon([], {
      renderer,
      color: '#b9e780',
      weight: 2,
      dashArray: '6 4',
      fillColor: '#8cba5d',
      fillOpacity: 0.18,
      interactive: false,
    }).addTo(map);
    let points: ScreenPoint[] = [];
    let pointerId: number | null = null;
    let frame = 0;
    const toPoint = (event: PointerEvent): ScreenPoint => {
      const rect = container.getBoundingClientRect();
      return [
        Math.max(0, Math.min(rect.width, event.clientX - rect.left)),
        Math.max(0, Math.min(rect.height, event.clientY - rect.top)),
      ];
    };
    const draw = () => {
      frame = 0;
      outline.setLatLngs(points.map((point) => map.containerPointToLatLng([point[0], point[1]])));
    };
    const reset = () => {
      if (pointerId !== null && container.hasPointerCapture(pointerId)) {
        container.releasePointerCapture(pointerId);
      }
      pointerId = null;
      points = [];
      cancelAnimationFrame(frame);
      frame = 0;
      outline.setLatLngs([]);
    };
    const stop = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    const down = (event: PointerEvent) => {
      if (
        !event.isPrimary ||
        event.button !== 0 ||
        pointerId !== null ||
        (event.target instanceof Element &&
          event.target.closest(
            '.map-selection-controls, .leaflet-control, .map-section-interactive',
          ))
      ) {
        return;
      }
      stop(event);
      pointerId = event.pointerId;
      points = [toPoint(event)];
      container.setPointerCapture(pointerId);
      container.focus({ preventScroll: true });
    };
    const move = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) {
        return;
      }
      stop(event);
      const point = toPoint(event);
      const previous = points[points.length - 1];
      if (Math.hypot(point[0] - previous[0], point[1] - previous[1]) < 3) {
        return;
      }
      points.push(point);
      if (points.length > 512) {
        points = points.filter((_, index) => index % 2 === 0 || index === points.length - 1);
      }
      if (!frame) {
        frame = requestAnimationFrame(draw);
      }
    };
    const up = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) {
        return;
      }
      stop(event);
      points.push(toPoint(event));
      const ids = getLassoFieldIds(features, points, (longitude, latitude) => {
        const point = map.latLngToContainerPoint([latitude, longitude]);
        return [point.x, point.y];
      });
      const start = points[0];
      const isClick = points.every(
        (point) => Math.hypot(point[0] - start[0], point[1] - start[1]) <= 6,
      );
      if (isClick) {
        let nearest: CatalogFeature | undefined;
        let nearestDistance = 9;
        for (const feature of features) {
          if (feature.properties.kind !== 'field' || feature.id === undefined) {
            continue;
          }
          const [longitude, latitude] = feature.geometry.coordinates;
          const point = map.latLngToContainerPoint([latitude, longitude]);
          const distance = Math.hypot(point.x - start[0], point.y - start[1]);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearest = feature;
          }
        }
        if (nearest) {
          onToggle(nearest);
        }
      } else if (isValidLasso(points)) {
        const selected = new Set(ids);
        const coordinates: SectionCoordinate[] = points.map((point) => {
          const location = map.containerPointToLatLng([point[0], point[1]]);
          return [location.lat, location.lng];
        });
        onComplete(
          coordinates,
          features.filter(
            (feature) => feature.properties.kind === 'field' && selected.has(String(feature.id)),
          ),
        );
      }
      reset();
    };
    const cancel = () => reset();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        stop(event);
        cancel();
        setArmed(false);
      }
    };
    const click = (event: MouseEvent) => {
      if (!(
        event.target instanceof Element &&
        event.target.closest('.map-selection-controls, .leaflet-control, .map-section-interactive')
      )) {
        stop(event);
      }
    };
    container.addEventListener('pointerdown', down, true);
    container.addEventListener('pointermove', move, true);
    container.addEventListener('pointerup', up, true);
    container.addEventListener('pointercancel', cancel, true);
    container.addEventListener('lostpointercapture', cancel, true);
    container.addEventListener('click', click, true);
    container.addEventListener('keydown', keydown, true);
    window.addEventListener('blur', cancel);
    map.on('movestart resize', cancel);
    return () => {
      reset();
      container.removeEventListener('pointerdown', down, true);
      container.removeEventListener('pointermove', move, true);
      container.removeEventListener('pointerup', up, true);
      container.removeEventListener('pointercancel', cancel, true);
      container.removeEventListener('lostpointercapture', cancel, true);
      container.removeEventListener('click', click, true);
      container.removeEventListener('keydown', keydown, true);
      window.removeEventListener('blur', cancel);
      map.off('movestart resize', cancel);
      outline.remove();
      renderer.remove();
      container.style.touchAction = oldTouchAction;
      container.classList.remove('map-lasso-active');
      enabledHandlers.forEach((handler) => handler.enable());
    };
  }, [map, active, features, onComplete, onToggle]);

  return { active, setArmed };
}
