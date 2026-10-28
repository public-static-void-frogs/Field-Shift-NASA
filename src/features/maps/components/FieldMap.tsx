import { useSuspenseQuery } from '@tanstack/react-query';
import { Button, Select, Tooltip } from 'antd';
import 'leaflet/dist/leaflet.css';
import { Layers, LocateFixed, MapPin, Minus, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MapContainer, ScaleControl, TileLayer } from 'react-leaflet';
import { farmQueries } from '../../../api/farm/farm.queries.ts';
import type {
  FieldMapProps,
  MapViewportProps,
  ParcelLayerProps,
} from '../../../types/maps/FieldMap.types.ts';
import { satelliteTiles } from '../constants/maps.constants.ts';
import { useFieldMap } from '../hooks/useFieldMap.ts';
import { useMapViewport } from '../hooks/useMapViewport.ts';
import { useParcelLayer } from '../hooks/useParcelLayer.ts';
import { mapLegends } from '../utils/mapStyles.ts';
import { defaultCenter } from '../utils/mapViewport.ts';
import './FieldMap.css';

function MapViewport({ data }: MapViewportProps) {
  useMapViewport(data);
  return null;
}

function ParcelLayer({ fields, geojson, layer, onSelect, onAdd, adding }: ParcelLayerProps) {
  useParcelLayer({ fields, geojson, layer, onSelect, onAdd, adding });
  return null;
}

export function FieldMap({
  fields,
  geojson,
  onSelect,
  adding,
  onAdd,
  expanded = false,
  boundaryOnly = false,
}: FieldMapProps) {
  const { t } = useTranslation();
  const { map, setLayer, layer, recenter } = useFieldMap(geojson, boundaryOnly);

  const { data: preferences } = useSuspenseQuery(farmQueries.profile());
  const legend = mapLegends[layer].map((item) => ({ ...item, label: t(item.label) }));

  return (
    <div className={`field-map ${expanded ? 'expanded' : ''}`}>
      <MapContainer
        ref={map}
        className="map-canvas"
        center={defaultCenter}
        zoom={14}
        zoomSnap={0.25}
        minZoom={2}
        maxZoom={19}
        zoomControl={false}
        scrollWheelZoom
      >
        <TileLayer
          url={satelliteTiles.url}
          attribution={satelliteTiles.attribution}
          maxNativeZoom={19}
          maxZoom={19}
        />
        <MapViewport data={geojson} />
        <ParcelLayer
          fields={fields}
          geojson={geojson}
          layer={layer}
          onSelect={onSelect}
          onAdd={onAdd}
          adding={adding}
        />
        <ScaleControl position="bottomright" imperial={false} />
      </MapContainer>
      <div className="map-location">
        <MapPin size={13} />
        {preferences.farmName}
        <span>·</span>
        {preferences.locationLabel}
      </div>
      {!boundaryOnly && (
        <div className="map-layer">
          <Select
            aria-label={t('Map layer')}
            value={layer}
            onChange={setLayer}
            prefix={<Layers size={14} />}
            options={['Crop health', 'Soil moisture', 'Field boundaries'].map((value) => ({
              value,
              label: t(value),
            }))}
          />
        </div>
      )}
      <div className="map-controls">
        <Tooltip title={t('Zoom in')}>
          <Button type="text" aria-label={t('Zoom in')} onClick={() => map.current?.zoomIn()}>
            <Plus size={17} />
          </Button>
        </Tooltip>
        <Tooltip title={t('Zoom out')}>
          <Button type="text" aria-label={t('Zoom out')} onClick={() => map.current?.zoomOut()}>
            <Minus size={17} />
          </Button>
        </Tooltip>
        <Tooltip title={t('Recenter map')}>
          <Button type="text" aria-label={t('Recenter map')} onClick={recenter}>
            <LocateFixed size={17} />
          </Button>
        </Tooltip>
      </div>
      {!boundaryOnly && (
        <div className="map-legend">
          {legend.map((item) => (
            <span key={item.label}>
              <i style={{ background: item.color }} />
              {item.label}
            </span>
          ))}
        </div>
      )}
      {adding && (
        <div className="add-map-prompt">
          <Plus size={15} />
          {t('Select an outlined parcel to add it to your farm')}
        </div>
      )}
    </div>
  );
}
