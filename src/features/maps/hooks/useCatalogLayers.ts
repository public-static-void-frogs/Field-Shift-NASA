import {
  canvas,
  circleMarker,
  divIcon,
  geoJSON,
  layerGroup,
  marker,
  type CircleMarker,
} from 'leaflet';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMapEvents } from 'react-leaflet';
import type { CatalogMapView } from '../../../types/maps/map.types.ts';
import { clusterMarkerSize, layoutMapClusters } from '../utils/clusterLayout.ts';
import { clusterView } from '../utils/catalogViewport.ts';
import { catalogPointStyle } from '../utils/catalogPointStyle.ts';

export function useCatalogLayers(
  data: CatalogMapView | undefined,
  onPick: (id: string) => void,
  selectedIds: ReadonlySet<string>,
) {
  const points = useRef(new Map<string, { marker: CircleMarker; inFarm: boolean }>());
  const [revision, setRevision] = useState(0);
  const refreshLayout = () => setRevision((value) => value + 1);
  const map = useMapEvents({ moveend: refreshLayout, resize: refreshLayout });
  const { t } = useTranslation();
  useEffect(() => {
    if (!data) {
      return;
    }
    const pointMarkers = points.current;
    const started = performance.now();
    const layers = layerGroup().addTo(map);
    const renderer = canvas({ padding: 0.2 });
    const pixelBounds = map.getPixelBounds();
    const size = map.getSize();
    const zoom = map.getZoom();
    const groups = layoutMapClusters(
      data.features,
      (longitude, latitude) => map.project([latitude, longitude], zoom),
      { left: pixelBounds.min!.x, top: pixelBounds.min!.y, width: size.x, height: size.y },
    );
    for (const group of groups) {
      const label = t('{{count}} fields. Zoom in to explore.', { count: group.count });
      const icon = divIcon({
        className: 'catalog-cluster',
        html: `<span>${new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(group.count)}</span>`,
        iconSize: [clusterMarkerSize, clusterMarkerSize],
        iconAnchor: [clusterMarkerSize / 2, clusterMarkerSize / 2],
      });
      const item = marker(map.unproject([group.x, group.y], zoom), {
        icon,
        title: label,
        alt: label,
        keyboard: true,
      });
      item.on('click', () => {
        const next = clusterView(group.bounds, map.getZoom());
        map.setView(next.center, next.zoom);
        map.getContainer().focus({ preventScroll: true });
      });
      item.addTo(layers);
    }
    for (const feature of data.features) {
      if (feature.properties.kind === 'field') {
        const inFarm = Boolean(feature.properties.fieldId);
        const point = geoJSON(feature, {
          pointToLayer: (_, latlng) => {
            const marker = circleMarker(latlng, { renderer, ...catalogPointStyle(inFarm, false) });
            pointMarkers.set(String(feature.id), { marker, inFarm });
            return marker;
          },
          onEachFeature: (_, layer) => {
            layer.on('click', () => onPick(String(feature.id)));
            const tooltip = document.createElement('span');
            tooltip.textContent = `${feature.properties.name} · ${feature.properties.area.toFixed(1)} ${t('ha')}`;
            layer.bindTooltip(tooltip, { sticky: true });
          },
        });
        point.addTo(layers);
      }
    }
    const frame = requestAnimationFrame(() => {
      const container = map.getContainer();
      container.dataset.mapMode = data.mode;
      container.dataset.mapFeatureCount = String(
        groups.length +
          data.features.filter((feature) => feature.properties.kind === 'field').length,
      );
      container.dataset.mapSourceFeatureCount = String(data.features.length);
      container.dataset.mapLayerUpdateMs = (performance.now() - started).toFixed(2);
    });
    return () => {
      cancelAnimationFrame(frame);
      pointMarkers.clear();
      layers.remove();
      renderer.remove();
    };
  }, [map, data, onPick, t, revision]);
  useEffect(() => {
    for (const [id, point] of points.current) {
      const style = catalogPointStyle(point.inFarm, selectedIds.has(id));
      point.marker.setStyle(style);
      point.marker.setRadius(style.radius ?? 5);
    }
  }, [data, selectedIds, t, revision]);
}
