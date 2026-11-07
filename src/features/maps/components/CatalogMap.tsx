import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Spin } from 'antd';
import 'leaflet/dist/leaflet.css';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { MapContainer, ScaleControl, TileLayer } from 'react-leaflet';
import { mapQueries } from '../../../api/maps/maps.queries.ts';
import { satelliteTiles } from '../constants/maps.constants.ts';
import { useCatalogLayers } from '../hooks/useCatalogLayers.ts';
import { useMapFieldSelection } from '../hooks/useMapFieldSelection.ts';
import { useLassoSelection } from '../hooks/useLassoSelection.ts';
import { useCatalogViewport } from '../hooks/useCatalogViewport.ts';
import { useMapPosition } from '../hooks/useMapPosition.ts';
import { parseMapPosition } from '../utils/catalogViewport.ts';
import { MapSelectionControls } from './MapSelectionControls.tsx';
import './FieldMap.css';
import './CatalogMap.css';

export function CatalogMap() {
  const { t } = useTranslation();
  const summary = useQuery(mapQueries.summary());
  const [parameters] = useSearchParams();
  const savedView = parseMapPosition(parameters);
  if (!summary.data) {
    return (
      <div className="catalog-map-start" role="status">
        {summary.isError ? (
          <Alert
            type="error"
            title={t('Unable to load the field map')}
            action={<Button onClick={() => summary.refetch()}>{t('Try again')}</Button>}
          />
        ) : (
          <Spin description={t('Loading field coverage…')} />
        )}
      </div>
    );
  }

  return (
    <div className="fullscreen-map">
      <section className="field-map expanded catalog-map" aria-label={t('Field map')}>
        <MapContainer
          className="map-canvas"
          center={savedView?.center ?? summary.data.defaultCenter}
          zoom={savedView?.zoom ?? summary.data.defaultZoom}
          zoomControl={false}
          minZoom={2}
          maxZoom={19}
          preferCanvas
          maxBounds={[
            [-85, -180],
            [85, 180],
          ]}
          maxBoundsViscosity={1}
        >
          <TileLayer
            url={satelliteTiles.url}
            attribution={satelliteTiles.attribution}
            maxNativeZoom={19}
            maxZoom={19}
            noWrap
          />
          <CatalogViewport />
          <ScaleControl position="bottomright" imperial={false} />
        </MapContainer>
      </section>
    </div>
  );
}

function CatalogViewport() {
  const query = useCatalogViewport();
  const selection = useMapFieldSelection();
  const canLasso = query.data?.mode === 'fields' && !query.isPlaceholderData && !query.isFetching;
  const lasso = useLassoSelection({
    features: query.data?.features ?? [],
    available: canLasso,
    onSelect: selection.add,
    onToggle: selection.toggle,
  });
  useMapPosition();
  const { t } = useTranslation();
  useCatalogLayers(query.data, selection.toggle, selection.selectedIds);

  return (
    <>
      <MapSelectionControls
        count={selection.selectedIds.size}
        lassoActive={lasso.active}
        canLasso={canLasso}
        onLasso={() => lasso.setArmed(!lasso.active)}
        onClear={selection.clear}
      />
      {query.isError && (
        <div className="catalog-map-alert">
          <Alert
            type="error"
            title={t('Unable to load this area')}
            description={t('Move the map or try again.')}
            action={<Button onClick={() => query.refetch()}>{t('Try again')}</Button>}
          />
        </div>
      )}
    </>
  );
}
