import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Spin } from 'antd';
import type { Map as LeafletMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { X } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { MapContainer, ScaleControl, TileLayer } from 'react-leaflet';
import { fieldQueries } from '../../../api/fields/fields.queries.ts';
import { mapQueries } from '../../../api/maps/maps.queries.ts';
import { RouterButton } from '../../../components/common/RouterButton';
import { satelliteTiles } from '../constants/maps.constants.ts';
import { useCatalogLayers } from '../hooks/useCatalogLayers.ts';
import { useCatalogSelection } from '../hooks/useCatalogSelection.ts';
import { useCatalogViewport } from '../hooks/useCatalogViewport.ts';
import { useMapPosition } from '../hooks/useMapPosition.ts';
import { parseMapPosition } from '../utils/catalogViewport.ts';
import './FieldMap.css';
import './CatalogMap.css';

export function CatalogMap() {
  const { t } = useTranslation();
  const summary = useQuery(mapQueries.summary());
  const [parameters] = useSearchParams();
  const savedView = parseMapPosition(parameters);
  const map = useRef<LeafletMap | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const onPick = useCallback((id: string) => setActiveId(id), []);
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
          ref={map}
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
          <CatalogViewport onPick={onPick} ready={summary.data.status === 'ready'} />
          <ScaleControl position="bottomright" imperial={false} />
        </MapContainer>
        {activeId && (
          <CatalogSelection
            id={activeId}
            onClose={() => {
              setActiveId(null);
              map.current?.getContainer().focus({ preventScroll: true });
            }}
          />
        )}
      </section>
    </div>
  );
}

type CatalogViewportProps = {
  onPick: (id: string) => void;
  ready: boolean;
};

function CatalogViewport({ onPick, ready }: CatalogViewportProps) {
  const query = useCatalogViewport(ready);
  useMapPosition();
  const { t } = useTranslation();
  useCatalogLayers(query.data, onPick);

  if (!query.isError) {
    return null;
  }

  return (
    <div className="catalog-map-alert">
      <Alert
        type="error"
        title={t('Unable to load this area')}
        description={t('Move the map or try again.')}
        action={<Button onClick={() => query.refetch()}>{t('Try again')}</Button>}
      />
    </div>
  );
}

type CatalogSelectionProps = { id: string; onClose: () => void };

function CatalogSelection({ id, onClose }: CatalogSelectionProps) {
  const { t } = useTranslation();
  const { data: field, isPending, isError, refetch } = useQuery(fieldQueries.catalogById(id));
  const fieldsQuery = useQuery(fieldQueries.list());
  const fields = fieldsQuery.data;
  const selected = fields?.some((item) => item.id === id) ?? false;
  const selection = useCatalogSelection();

  return (
    <aside className="catalog-selection" aria-label={t('Selected field')}>
      <Button
        className="catalog-close"
        type="text"
        icon={<X size={18} />}
        aria-label={t('Close field details')}
        autoFocus
        onClick={onClose}
      />
      {isPending && <Spin />}
      {isError && (
        <Alert
          type="error"
          title={t('Unable to load this field')}
          action={<Button onClick={() => refetch()}>{t('Try again')}</Button>}
        />
      )}
      {!isPending && !isError && !field && <p>{t('Field not found')}</p>}
      {fieldsQuery.isError && (
        <Alert
          type="error"
          title={t('Unable to load this field')}
          action={<Button onClick={() => fieldsQuery.refetch()}>{t('Try again')}</Button>}
        />
      )}
      {field && (
        <>
          <div className="catalog-eyebrow">
            {selected ? t('In my fields') : t('Available to select')}
          </div>
          <h2>{field.name}</h2>
          <dl>
            <div>
              <dt>{t('Area')}</dt>
              <dd>{t('{{value0}} ha', { value0: field.area.toFixed(2) })}</dd>
            </div>
            {field.county && (
              <div>
                <dt>{t('County')}</dt>
                <dd>{field.county}</dd>
              </div>
            )}
            {field.sourceId && (
              <div>
                <dt>{t('Source ID')}</dt>
                <dd>{field.sourceId}</dd>
              </div>
            )}
            <div>
              <dt>{t('Crop')}</dt>
              <dd>{field.crop || t('Not supplied')}</dd>
            </div>
          </dl>
          <p className="catalog-selection-note">
            {t(
              'These rectangles are estimated from source centroids and area. Crop and soil measurements have not been inferred.',
            )}
          </p>
          <Button
            block
            type="primary"
            loading={selection.isPending}
            disabled={!fields}
            onClick={() => selection.toggle(id, selected)}
          >
            {selected ? t('Remove from my fields') : t('Add to my fields')}
          </Button>
          {selected && (
            <RouterButton block className="section-gap" to={`/fields/${id}`}>
              {t('View field details')}
            </RouterButton>
          )}
        </>
      )}
    </aside>
  );
}
