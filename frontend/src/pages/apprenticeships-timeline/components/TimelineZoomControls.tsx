import type { ZoomLevel } from '../types';
import { Minus, Plus } from 'lucide-react';
import { ZOOM_LEVELS, getZoomLabel, zoomIn, zoomOut } from '../utils';

export default function TimelineZoomControls({ zoom, onZoomChange }: {
  zoom: ZoomLevel;
  onZoomChange: (zoom: ZoomLevel) => void;
}) {
  return <>
    <span className="shrink-0 text-xs font-extrabold uppercase tracking-wider text-slate-500">Zoom:</span>
    <div className="flex h-8 shrink-0 items-center overflow-hidden rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm" role="group" aria-label="Timeline zoom">
      {ZOOM_LEVELS.map(level => (
        <button key={level} type="button" onClick={() => onZoomChange(level)} aria-pressed={zoom === level}
          className="flex h-7 min-w-14 items-center justify-center rounded-md px-3 text-xs font-bold cursor-pointer transition-all whitespace-nowrap"
          style={{ background: zoom === level ? '#1B2A4A' : 'transparent', color: zoom === level ? '#fff' : '#64748B' }}>
          {getZoomLabel(level)}
        </button>
      ))}
    </div>
    <div className="ml-1 flex shrink-0 items-center gap-1">
      <button type="button" aria-label="Zoom out" onClick={() => onZoomChange(zoomOut(zoom))} disabled={zoom === 'year'}
        className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 cursor-pointer disabled:opacity-30 transition-all">
        <Minus size={15} aria-hidden="true" />
      </button>
      <button type="button" aria-label="Zoom in" onClick={() => onZoomChange(zoomIn(zoom))} disabled={zoom === 'day'}
        className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 cursor-pointer disabled:opacity-30 transition-all">
        <Plus size={15} aria-hidden="true" />
      </button>
    </div>
  </>;
}
