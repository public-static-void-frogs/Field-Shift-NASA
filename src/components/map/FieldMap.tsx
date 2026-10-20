import { useRef, useState } from 'react';
import { Button, Select, Tooltip } from 'antd';
import { Layers, LocateFixed, MapPin, Minus, Plus } from 'lucide-react';
import { parcels } from '../../data/fields';
import type { Field } from '../../types/field';
import { MapTerrain } from './MapTerrain';
import './FieldMap.css';

interface FieldMapProps {
  fields: Field[];
  onSelect: (field: Field) => void;
  adding: boolean;
  onAdd: (id: number) => void;
  expanded?: boolean;
}

export function FieldMap({
  fields,
  onSelect,
  adding,
  onAdd,
  expanded = false,
}: FieldMapProps) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [layer, setLayer] = useState('Crop health');
  const drag = useRef<{ x: number; y: number; ox: number; oy: number; } | null>(null);
  return (
    <div className={`field-map ${expanded ? 'expanded' : ''}`}>
      <svg
        className="map-canvas"
        viewBox="0 0 850 510"
        preserveAspectRatio="xMidYMid slice"
        onPointerDown={e => {
          if ((e.target as Element).closest('[data-parcel]')) return;
          drag.current = {
            x: e.clientX,
            y: e.clientY,
            ox: offset.x,
            oy: offset.y
          };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={e => {
          if (drag.current) {
            setOffset({
              x: drag.current.ox + (e.clientX - drag.current.x),
              y: drag.current.oy + (e.clientY - drag.current.y)
            });
          }
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onWheel={e => setZoom(v => Math.min(2.5, Math.max(.8, v + (e.deltaY < 0 ? .1 : -.1))))}
      >

        <rect
          width="850"
          height="510"
          fill="#8b9260"
        />
        <g transform={`translate(${offset.x} ${offset.y}) translate(425 255) scale(${zoom}) translate(-425 -255)`}>
          <MapTerrain />
          {parcels.map((p, i) => {
            const field = fields.find(f => f.id === i + 1);
            const color = layer === 'Field boundaries' ? '#e8e4c8' : layer === 'Soil moisture' ? '#8ab8cb' : field?.status === 'Critical' ? '#e7aa66' : field?.status === 'Needs attention' ? '#e4d17c' : '#c0dd8d';
            return (
              <g
                key={i}
                data-parcel="true"
                role="button"
                tabIndex={0}
                aria-label={field ? `View ${field.name}` : 'Add this field'}
                onClick={() => field ? onSelect(field) : onAdd(i + 1)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    if (field) onSelect(field);
                    else onAdd(i + 1);
                  }
                }}
                className={`parcel ${!field ? 'unowned' : ''}`}
              >
                <polygon
                  points={p.points}
                  fill={field ? color : '#e7e7ce'}
                  fillOpacity={layer === 'Field boundaries' ? '.03' : field ? '.20' : '.08'}
                  stroke={color}
                  strokeWidth={field ? 2.5 : 1.2}
                  strokeDasharray={field ? undefined : '6 5'}
                />
                {(field || adding) && <g transform={`translate(${p.x} ${p.y})`}>
                  <rect
                    x={field ? -92 : -65}
                    y="-17"
                    width={field ? 184 : 130}
                    height={field ? 50 : 38}
                    rx="6"
                    fill="#fffef9"
                    fillOpacity=".97"
                  />
                  <circle
                    cx={-74}
                    cy="-1"
                    r="3"
                    fill={color === '#c0dd8d' ? '#588448' : '#bd8532'}
                  />
                  <text
                    x={field ? -65 : 0}
                    y="3"
                    fontSize="14"
                    fontWeight="600"
                    fill="#343c2f"
                    textAnchor={field ? 'start' : 'middle'}
                  >
                    {field?.name || '+ Add field'}
                  </text>
                  {field && <text
                    x="-65"
                    y="22"
                    fontSize="14"
                    fill="#797d72"
                  >
                    {field.area}
                    ha ·
                    {field.crop}
                  </text>}
                </g>}
              </g>
            );
          })}
        </g>
      </svg>
      <div className="map-location">
        <MapPin size={13} />
        Green Valley Farm
        <span>·</span>
        Iowa, US
      </div>
      <div className="map-layer">
        <Select
          aria-label="Map layer"
          value={layer}
          onChange={setLayer}
          prefix={<Layers size={14} />}
          options={['Crop health', 'Soil moisture', 'Field boundaries'].map(value => ({ value, label: value }))}
        />
      </div>
      <div className="map-controls">
        <Tooltip title="Zoom in">
          <Button
            type="text"
            aria-label="Zoom in"
            onClick={() => setZoom(v => Math.min(2.5, v + .2))}
          >
            <Plus size={17} />
          </Button>
        </Tooltip>
        <Tooltip title="Zoom out">
          <Button
            type="text"
            aria-label="Zoom out"
            onClick={() => setZoom(v => Math.max(.8, v - .2))}
          >
            <Minus size={17} />
          </Button>
        </Tooltip>
        <Tooltip title="Recenter map">
          <Button
            type="text"
            aria-label="Recenter map"
            onClick={() => {
              setOffset({ x: 0, y: 0 });
              setZoom(1);
            }}
          >
            <LocateFixed size={17} />
          </Button>
        </Tooltip>
      </div>
      <div className="map-legend">
        <span>
          <i className="green" />
          Healthy
        </span>
        <span>
          <i className="yellow" />
          Needs attention
        </span>
        <span>
          <i className="orange" />
          Critical
        </span>
      </div>
      <div className="map-scale">
        ━━━━
        <span>200 m</span>
      </div>
      {adding && <div className="add-map-prompt">
        <Plus size={15} />
        Select an outlined parcel to add it to your farm
      </div>}
    </div>
  );
}
