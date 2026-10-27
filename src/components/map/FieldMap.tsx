import { useEffect, useRef, useState } from 'react';
import { Button, Select, Tooltip } from 'antd';
import { Layers, LocateFixed, MapPin, Minus, Plus } from 'lucide-react';
import { geoJSON, Path, type Map as LeafletMap, type PathOptions } from 'leaflet';
import { MapContainer, ScaleControl, TileLayer, useMap } from 'react-leaflet';
import { useFarm } from '../../hooks/useFarm';
import { satelliteTiles } from '../../data/fieldGeoJson';
import { getFeatureFieldId, getGeoJsonBounds } from '../../utils/mapGeometry';
import type { Field } from '../../types/field';
import type { FieldGeoJson, MapLayer } from '../../types/map';
import 'leaflet/dist/leaflet.css';
import './FieldMap.css';

interface FieldMapProps {
  fields: Field[];
  /** WGS84 GeoJSON polygons; properties.fieldId (or feature.id) links to fields. */
  geojson: FieldGeoJson;
  onSelect: (field: Field) => void;
  adding: boolean;
  onAdd: (id: number) => void;
  expanded?: boolean;
  /** Plain satellite view with field outlines, without metric layers or legend. */
  boundaryOnly?: boolean;
}

const defaultCenter: [number, number] = [42.042, -93.737];
const fitOptions = { padding: [50, 100] as [number, number], maxZoom: 16, animate: false };

function fitParcels(map: LeafletMap, data: FieldGeoJson) {
  const bounds = getGeoJsonBounds(data);
  if (bounds) map.fitBounds(bounds, fitOptions);
  else map.setView(defaultCenter, 14);
}

function MapViewport({ data }: { data: FieldGeoJson }) {
  const map = useMap();
  useEffect(() => {
    fitParcels(map, data);
  }, [map, data]);
  useEffect(() => {
    // Leaflet must remeasure when the sidebar or responsive layout changes width.
    const observer = new ResizeObserver(() => map.invalidateSize({ animate: false }));
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}

function parcelStyle(field: Field | undefined, layer: MapLayer): PathOptions {
  const color = !field ? '#f1ebcf' : layer === 'Field boundaries' ? '#f1ebcf' : layer === 'Soil moisture'
    ? field.moisture >= 60 ? '#61b4d4' : field.moisture >= 40 ? '#9bcdd9' : '#dbe5b2'
    : field.status === 'Critical' ? '#e7aa66' : field.status === 'Needs attention' ? '#e4d17c' : '#c0dd8d';
  return { color, fillColor: color, weight: field ? 2.5 : 1.5, fillOpacity: layer === 'Field boundaries' ? .02 : field ? .2 : .06, dashArray: field ? undefined : '6 5' };
}

function ParcelLayer({ fields, geojson, layer, onSelect, onAdd, adding }: FieldMapProps & { layer: MapLayer }) {
  const map = useMap();
  useEffect(() => {
    const parcels = geoJSON(geojson, {
      style: feature => parcelStyle(fields.find(field => field.id === (feature ? getFeatureFieldId(feature) : undefined)), layer),
      onEachFeature: (feature, polygon) => {
        const id = getFeatureFieldId(feature);
        const field = fields.find(item => item.id === id);
        const label = field ? `View ${field.name}` : id ? 'Add this field' : feature.properties?.name || 'Parcel';
        const activate = () => {
          if (field) onSelect(field);
          else if (id) onAdd(id);
        };
        if (field || id) polygon.on('click', activate);
        if (polygon instanceof Path) {
          const style = parcelStyle(field, layer);
          polygon.on({
            mouseover: () => polygon.setStyle({ weight: 4, fillOpacity: layer === 'Field boundaries' ? .08 : .35 }),
            mouseout: () => polygon.setStyle(style),
            add: () => {
              const element = polygon.getElement();
              if (!element) return;
              element.setAttribute('role', field || id ? 'button' : 'img');
              if (field || id) element.setAttribute('tabindex', '0');
              element.setAttribute('aria-label', label);
              element.addEventListener('keydown', event => {
                if (event instanceof KeyboardEvent && (event.key === 'Enter' || event.key === ' ')) {
                  event.preventDefault();
                  event.stopPropagation();
                  activate();
                }
              });
            },
          });
        }
        if (field || adding || feature.properties?.name) {
          // DOM text avoids interpreting GeoJSON properties and user field names as HTML.
          const content = document.createElement('div');
          const title = document.createElement('strong');
          title.textContent = field?.name || feature.properties?.name || '+ Add field';
          content.append(title);
          if (field) {
            const detail = document.createElement('span');
            detail.textContent = `${field.area} ha · ${field.crop}`;
            content.append(detail);
          }
          polygon.bindTooltip(content, { permanent: true, direction: 'center', className: 'field-map-label', opacity: 1 });
        }
      },
    }).addTo(map);
    return () => { parcels.remove(); };
  }, [map, geojson, fields, layer, onSelect, onAdd, adding]);
  return null;
}

export function FieldMap({ fields, geojson, onSelect, adding, onAdd, expanded = false, boundaryOnly = false }: FieldMapProps) {
  const map = useRef<LeafletMap | null>(null);
  const [selectedLayer, setLayer] = useState<MapLayer>('Crop health');
  const layer = boundaryOnly ? 'Field boundaries' : selectedLayer;
  const { preferences } = useFarm();
  const legend = layer === 'Soil moisture'
    ? [{ color: '#61b4d4', label: '60% or more' }, { color: '#9bcdd9', label: '40–59%' }, { color: '#dbe5b2', label: 'Below 40%' }]
    : layer === 'Field boundaries'
      ? [{ color: '#f1ebcf', label: 'Field boundaries' }, { color: '#f1ebcf', label: 'Dashed: available' }]
      : [{ color: '#82a66a', label: 'Healthy' }, { color: '#c8b969', label: 'Needs attention' }, { color: '#d59a62', label: 'Critical' }];

  return <div className={`field-map ${expanded ? 'expanded' : ''}`}>
    <MapContainer
      ref={map}
      className="map-canvas"
      center={defaultCenter}
      zoom={14}
      zoomSnap={.25}
      minZoom={2}
      maxZoom={19}
      zoomControl={false}
      scrollWheelZoom
    >
      <TileLayer url={satelliteTiles.url} attribution={satelliteTiles.attribution} maxNativeZoom={19} maxZoom={19} />
      <MapViewport data={geojson} />
      <ParcelLayer fields={fields} geojson={geojson} layer={layer} onSelect={onSelect} onAdd={onAdd} adding={adding} />
      <ScaleControl position="bottomright" imperial={false} />
    </MapContainer>
    <div className="map-location"><MapPin size={13} />{preferences.farmName}<span>·</span>Iowa, US</div>
    {!boundaryOnly && <div className="map-layer">
      <Select
        aria-label="Map layer"
        value={layer}
        onChange={setLayer}
        prefix={<Layers size={14} />}
        options={['Crop health', 'Soil moisture', 'Field boundaries'].map(value => ({ value, label: value }))}
      />
    </div>}
    <div className="map-controls">
      <Tooltip title="Zoom in"><Button type="text" aria-label="Zoom in" onClick={() => map.current?.zoomIn()}><Plus size={17} /></Button></Tooltip>
      <Tooltip title="Zoom out"><Button type="text" aria-label="Zoom out" onClick={() => map.current?.zoomOut()}><Minus size={17} /></Button></Tooltip>
      <Tooltip title="Recenter map"><Button type="text" aria-label="Recenter map" onClick={() => { if (map.current) fitParcels(map.current, geojson); }}><LocateFixed size={17} /></Button></Tooltip>
    </div>
    {!boundaryOnly && <div className="map-legend">
      {legend.map(item => <span key={item.label}><i style={{ background: item.color }} />{item.label}</span>)}
    </div>}
    {adding && <div className="add-map-prompt"><Plus size={15} />Select an outlined parcel to add it to your farm</div>}
  </div>;
}
