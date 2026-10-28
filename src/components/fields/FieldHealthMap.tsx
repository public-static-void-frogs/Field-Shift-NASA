import { useTranslation } from 'react-i18next';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button, Card, Flex, Select, Space, Statistic, Switch, Tag, Tooltip, Typography } from 'antd';
import { Layers, LocateFixed, MapPin, Minus, Plus } from 'lucide-react';
import { getFieldHealthMap, getHealthZones } from '../../data/fieldHealth';
import { parcels } from '../../data/fields';
import type { Field } from '../../types/field';
import { MapTerrain } from '../map/MapTerrain';
import './FieldHealthMap.css';

export function FieldHealthMap({ field }: { field: Field }) {
  const { t } = useTranslation();
  const prefix = useId();
  const map = useMemo(() => getFieldHealthMap(field.id), [field.id]);
  const zones = useMemo(() => getHealthZones(field.id), [field.id]);
  const [selectedId, setSelectedId] = useState(() => [...zones].sort((a, b) => a.score - b.score)[0].id);
  const [showOverlay, setShowOverlay] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [aspectRatio, setAspectRatio] = useState(2);
  const frameRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const selectedZone = zones.find(zone => zone.id === selectedId) ?? zones[0];
  const { geometry } = map;
  const centerX = geometry.minX + geometry.width / 2;
  const centerY = geometry.minY + geometry.height / 2;
  const frameHeight = Math.max(geometry.height + 70, (geometry.width + 80) / aspectRatio);
  const frameWidth = frameHeight * aspectRatio;
  const markerRadius = frameHeight / 420 * 15;

  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.height > 0) {
        setAspectRatio(entry.contentRect.width / entry.contentRect.height);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  function resetView() {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }

  return (
    <Card
      title={<Space><Layers size={22} />{t('Field health map')}</Space>}
      extra={<Tag>May 24, 2026</Tag>}
      className="field-health-card"
    >
      <div className="field-health-intro">
        <Typography.Paragraph type="secondary">
           {t('A closer look at growth across your field. Red marks the areas that need the most care; green shows the strongest growth.')} </Typography.Paragraph>
        <Flex gap={12} align="center" wrap>
          <Switch id={`${prefix}-overlay`} checked={showOverlay} onChange={setShowOverlay} aria-label={t('Show field health overlay')} />
          <label htmlFor={`${prefix}-overlay`}>{t('Health overlay')}</label>
        </Flex>
      </div>
      <div ref={frameRef} className="field-health-map-frame">
        <svg
          viewBox={`${centerX - frameWidth / 2} ${centerY - frameHeight / 2} ${frameWidth} ${frameHeight}`}
          className="field-health-canvas"
          role="group"
          aria-label={t('{{value0}} health map. Select a zone to inspect crop growth.', { value0: field.name })}
          onPointerDown={event => {
            if ((event.target as Element).closest('[data-health-zone]')) return;
            drag.current = { x: event.clientX, y: event.clientY, offsetX: offset.x, offsetY: offset.y };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={event => {
            if (!drag.current) return;
            const scale = frameWidth / event.currentTarget.getBoundingClientRect().width;
            setOffset({
              x: drag.current.offsetX + (event.clientX - drag.current.x) * scale,
              y: drag.current.offsetY + (event.clientY - drag.current.y) * scale,
            });
          }}
          onPointerUp={() => { drag.current = null; }}
          onPointerCancel={() => { drag.current = null; }}
        >
          <defs>
            <clipPath id={`${prefix}-field-clip`}><polygon points={geometry.points} /></clipPath>
            <filter id={`${prefix}-smooth`} x="-10%" y="-10%" width="120%" height="120%" colorInterpolationFilters="sRGB">
              <feGaussianBlur stdDeviation={Math.max(map.cellWidth, map.cellHeight) * 0.7} />
            </filter>
            <pattern id={`${prefix}-crop-rows`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(12)">
              <path d="M0 0V5" stroke="#203b20" strokeWidth="0.6" opacity="0.13" />
            </pattern>
          </defs>
          <g transform={`translate(${offset.x} ${offset.y}) translate(${centerX} ${centerY}) scale(${zoom}) translate(${-centerX} ${-centerY})`}>
            <MapTerrain />
            {parcels.map((parcel, index) => index !== field.id - 1 && <polygon key={index} points={parcel.points} fill="#e6e8cb" fillOpacity="0.12" stroke="#d1d2ad" strokeWidth="1" />)}
            <polygon points={geometry.points} fill="#88944e" />
            <g clipPath={`url(#${prefix}-field-clip)`}>
              {showOverlay && (
                <g filter={`url(#${prefix}-smooth)`} opacity="0.96" aria-hidden="true">
                  {map.cells.map((cell, index) => (
                    <rect key={index} x={cell.x} y={cell.y} width={map.cellWidth + 0.1} height={map.cellHeight + 0.1} fill={cell.color} />
                  ))}
                </g>
              )}
              <polygon points={geometry.points} fill={`url(#${prefix}-crop-rows)`} />
            </g>
            <polygon points={geometry.points} fill="none" stroke="#34452c" strokeWidth="3" vectorEffect="non-scaling-stroke" />
            <polygon points={geometry.points} fill="none" stroke="#fffef2" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            {zones.map(zone => (
              <g
                key={zone.id}
                transform={`translate(${geometry.minX + geometry.width * zone.x} ${geometry.minY + geometry.height * zone.y})`}
                role="button"
                tabIndex={0}
                aria-label={t('Zone {{value0}}: {{value1}}, health {{value2}} of 100, {{value3}}', { value0: zone.id, value1: zone.name, value2: zone.score, value3: zone.level })}
                aria-pressed={selectedId === zone.id}
                data-health-zone={zone.id}
                className="field-health-marker"
                onClick={() => setSelectedId(zone.id)}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelectedId(zone.id);
                  }
                }}
              >
                <title>{`${zone.name} · ${zone.score}/100 · ${zone.level}`}</title>
                {selectedId === zone.id && <circle r={markerRadius * 1.5} fill="none" stroke="#fffef2" strokeWidth="2" vectorEffect="non-scaling-stroke" />}
                <circle r={markerRadius} fill={selectedId === zone.id ? '#344b2d' : '#fffef7'} stroke="#fffef7" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                <text textAnchor="middle" dominantBaseline="central" fill={selectedId === zone.id ? '#ffffff' : '#303b2c'} fontSize={markerRadius * 1.1} fontWeight="600" pointerEvents="none">{zone.id}</text>
              </g>
            ))}
          </g>
        </svg>
        <Tag className="field-health-location" icon={<MapPin size={16} />}>{t('{{value0}} · {{value1}} ha', { value0: field.name, value1: field.area })}</Tag>
        <div className="field-health-compass" aria-label={t('North is up')}><span>{t('North abbreviation')}</span><span>↑</span></div>
        <Space orientation="vertical" size={3} className="field-health-map-controls">
          <Tooltip title={t('Zoom in')}><Button aria-label={t('Zoom into field health map')} icon={<Plus size={20} />} disabled={zoom >= 2.5} onClick={() => setZoom(value => Math.min(2.5, value + 0.25))} /></Tooltip>
          <Tooltip title={t('Zoom out')}><Button aria-label={t('Zoom out of field health map')} icon={<Minus size={20} />} disabled={zoom <= 1} onClick={() => setZoom(value => Math.max(1, value - 0.25))} /></Tooltip>
          <Tooltip title={t('Fit field')}><Button aria-label={t('Reset field health map')} icon={<LocateFixed size={20} />} onClick={resetView} /></Tooltip>
        </Space>
        <span className="field-health-map-hint">{t('Drag to explore · Select a marked zone')}</span>
      </div>
      <div className="field-health-legend" aria-label={t('Health color scale, from red critical to green thriving')}>
        <div className="field-health-color-ramp" />
        <Flex justify="space-between" gap={12}><span>{t('Critical')}</span><span>{t('Struggling')}</span><span>{t('Fair')}</span><span>{t('Thriving')}</span></Flex>
      </div>
      <div className="field-health-zone-detail">
        <Flex justify="space-between" align="center" gap={16} wrap>
          <Select
            aria-label={t('Select field health zone')}
            value={selectedId}
            onChange={setSelectedId}
            options={zones.map(zone => ({ value: zone.id, label: t('Zone {{value0}} · {{value1}}', { value0: zone.id, value1: zone.name }) }))}
          />
          <Tag color={selectedZone.level === 'Critical' ? 'error' : selectedZone.level === 'Thriving' ? 'success' : 'warning'}>
            {`${selectedZone.level} · ${selectedZone.score}/100`}
          </Tag>
        </Flex>
        <Typography.Paragraph aria-live="polite">{selectedZone.description}</Typography.Paragraph>
      </div>
      <div className="field-health-coverage" aria-label={t('Health distribution across the field')}>
        {map.coverage.map(level => (
          <Card key={level.label} size="small">
            <Statistic title={<Space><i style={{ background: level.color }} />{level.label}</Space>} value={level.percentage === 0 && level.fraction > 0 ? '<1' : level.percentage} suffix="%" />
            <Typography.Text type="secondary">{t('{{value0}} ha · {{value1}}', { value0: (field.area * level.fraction).toFixed(1), value1: level.description.split(' · ')[1] })}</Typography.Text>
          </Card>
        ))}
      </div>
    </Card>
  );
}
