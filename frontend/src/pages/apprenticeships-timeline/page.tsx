import { useState } from 'react';
import { Link } from 'react-router-dom';
import TopNav from '@/components/feature/TopNav';
import Footer from '@/components/feature/Footer';
import CohortModal, { MS, mi, Group, CRow } from './components/CohortModal';
import ScheduleTable from './components/ScheduleTable';

// ── Timeline config ───────────────────────────────────────────────────────
const T    = 41;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const pl   = (s: number) => `${(clamp(s, 0, T) / T) * 100}%`;
const pw   = (s: number, d: number) => `${(Math.min(d, T - s) / T) * 100}%`;
const pwn  = (s: number, d: number) => (Math.min(d, T - s) / T) * 100;
const getCurrentTimelineIndex = () => {
  const now = new Date();
  return mi(now.getFullYear(), now.getMonth() + 1);
};
const getCurrentTimelineLabel = () => {
  const now = new Date();
  return now.toLocaleString('en-GB', { month: 'short', year: 'numeric' });
};

const MONTH_LABELS = [
  'Aug','Sep','Oct','Nov','Dec',
  'Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec',
  'Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec',
  'Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec',
];

// All year bands in the same navy family
const YEAR_CFG = [
  { yr:'2024', span:5,  bg:'#1B2A4A', qts:[{q:'Q3',s:3},{q:'Q4',s:2}] },
  { yr:'2025', span:12, bg:'#243560', qts:[{q:'Q1',s:3},{q:'Q2',s:3},{q:'Q3',s:3},{q:'Q4',s:3}] },
  { yr:'2026', span:12, bg:'#2E4482', qts:[{q:'Q1',s:3},{q:'Q2',s:3},{q:'Q3',s:3},{q:'Q4',s:3}] },
  { yr:'2027', span:12, bg:'#3D5A99', qts:[{q:'Q1',s:3},{q:'Q2',s:3},{q:'Q3',s:3},{q:'Q4',s:3}] },
];

const LEFT_W = 182;

// Programme colours — all from the KBC navy-amber family
const INITIAL_GROUPS: Group[] = [
  {
    name:'Project Control\nProfessional L6 (PCP)',
    sub:'2024 – 2027', color:'#1B2A4A', rowBg:'rgba(27,42,74,0.04)',
    rows:[
      { label:'Cohort 1 - G1', dateLbl:'Aug 2024', blks:[
        {mod:'pmp',s:mi(2024,8),d:5},{mod:'pmiSP',s:mi(2025,1),d:5},
        {mod:'evm',s:mi(2025,6),d:4},{mod:'risk',s:mi(2025,10),d:3},{mod:'ppc',s:mi(2026,1),d:3},
      ]},
      { label:'Cohort 2 - G2', dateLbl:'Jan 2025', blks:[
        {mod:'pmp',s:mi(2025,1),d:5},{mod:'pmiSP',s:mi(2025,6),d:4},
        {mod:'evm',s:mi(2025,10),d:3},{mod:'risk',s:mi(2026,1),d:3},{mod:'ppc',s:mi(2026,4),d:3},
      ]},
      { label:'Cohort 3 - G1', dateLbl:'May 2025', blks:[
        {mod:'pmp',s:mi(2025,5),d:5},{mod:'pmiSP',s:mi(2025,10),d:4},
        {mod:'evm',s:mi(2026,2),d:3},{mod:'risk',s:mi(2026,5),d:3},{mod:'ppc',s:mi(2026,8),d:3},
      ]},
      { label:'Cohort 4 - G1', dateLbl:'Oct 2025', blks:[
        {mod:'pmp',s:mi(2025,10),d:5},{mod:'pmiSP',s:mi(2026,3),d:4},
        {mod:'evm',s:mi(2026,7),d:3},{mod:'risk',s:mi(2026,10),d:3},{mod:'ppc',s:mi(2027,1),d:3},
      ]},
    ],
  },
  {
    name:'Marketing Executive\nL4 (ME)',
    sub:'2025 – 2026', color:'#2E4482', rowBg:'rgba(46,68,130,0.04)',
    rows:[
      { label:'Cohort 1 - G1', dateLbl:'Jan 2025', blks:[
        {mod:'impact',s:mi(2025,1),d:4},{mod:'social',s:mi(2025,5),d:3},{mod:'tech',s:mi(2025,8),d:2},
      ]},
      { label:'Cohort 2 - G4', dateLbl:'May 2025', blks:[
        {mod:'impact',s:mi(2025,5),d:4},{mod:'social',s:mi(2025,9),d:3},{mod:'tech',s:mi(2025,12),d:2},
      ]},
      { label:'Cohort 3 - G1', dateLbl:'Jul 2025', blks:[
        {mod:'impact',s:mi(2025,7),d:4},{mod:'social',s:mi(2025,11),d:3},{mod:'tech',s:mi(2026,2),d:2},
      ]},
      { label:'Cohort 4 - G2', dateLbl:'Oct 2025', blks:[
        {mod:'impact',s:mi(2025,10),d:4},{mod:'social',s:mi(2026,2),d:3},{mod:'tech',s:mi(2026,5),d:2},
      ]},
      { label:'Cohort 5 - G2', dateLbl:'Jan 2026', blks:[
        {mod:'impact',s:mi(2026,1),d:4},{mod:'social',s:mi(2026,5),d:3},
      ]},
    ],
  },
  {
    name:'Marketing Manager\nL6 (MM)',
    sub:'2025 – 2026', color:'#3D5A99', rowBg:'rgba(61,90,153,0.04)',
    rows:[
      { label:'Cohort 1 - G1', dateLbl:'May 2025', blks:[
        {mod:'strat',s:mi(2025,5),d:5},{mod:'comm',s:mi(2025,10),d:3},
        {mod:'cust',s:mi(2026,1),d:4},{mod:'ai',s:mi(2026,5),d:3},
      ]},
      { label:'Cohort 1 - G3', dateLbl:'Oct 2025', blks:[
        {mod:'strat',s:mi(2025,10),d:5},{mod:'comm',s:mi(2026,3),d:3},{mod:'cust',s:mi(2026,6),d:4},
      ]},
      { label:'Cohort 1 - G3', dateLbl:'Jan 2026', blks:[
        {mod:'strat',s:mi(2026,1),d:5},{mod:'comm',s:mi(2026,6),d:3},
      ]},
    ],
  },
];

type ModalState =
  | { open: false }
  | { open: true; mode: 'add'; defaultGroupIdx: number }
  | { open: true; mode: 'edit'; groupIdx: number; rowIdx: number; row: CRow };

interface DeleteConfirm { groupIdx: number; rowIdx: number; }

// ── Timeline sub-components ───────────────────────────────────────────────
function TimelineHeaders() {
  return (
    <>
      <div className="flex" style={{ borderBottom:'1px solid rgba(255,255,255,0.2)' }}>
        <div style={{ width:LEFT_W, flexShrink:0, borderRight:'1px solid #E5E7EB', background:'#F8FAFC' }} />
        <div className="flex-1 flex">
          {YEAR_CFG.map(y => (
            <div key={y.yr} className="text-center font-bold py-2 border-r border-white/20 tracking-widest"
              style={{ flex:y.span, background:y.bg, color:'#fff', fontSize:'12px', letterSpacing:'0.12em' }}>
              {y.yr}
            </div>
          ))}
        </div>
      </div>
      <div className="flex" style={{ borderBottom:'1px solid #E5E7EB' }}>
        <div style={{ width:LEFT_W, flexShrink:0, borderRight:'1px solid #E5E7EB', background:'#F8FAFC' }} />
        <div className="flex-1 flex">
          {YEAR_CFG.map(y =>
            y.qts.map((qt, qi) => (
              <div key={`${y.yr}${qt.q}`} className="text-center font-semibold py-1 border-r border-gray-200"
                style={{ flex:qt.s, fontSize:'9px', color:'#374151', background:qi%2===0?`${y.bg}20`:`${y.bg}0C` }}>
                {qt.q}
              </div>
            ))
          )}
        </div>
      </div>
      <div className="flex" style={{ borderBottom:'1px solid #D1D5DB' }}>
        <div style={{ width:LEFT_W, flexShrink:0, borderRight:'1px solid #E5E7EB', background:'#F8FAFC' }} />
        <div className="flex-1 flex">
          {MONTH_LABELS.map((m, i) => (
            <div key={i} className="text-center py-0.5 border-r border-gray-100"
              style={{ flex:1, background:i%2===0?'#fff':'rgba(0,0,0,0.015)' }}>
              <span className="font-medium" style={{ fontSize:'7.5px', color:'#9CA3AF' }}>{m}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function NowLine({ showLabel }: { showLabel: boolean }) {
  const nowIndex = getCurrentTimelineIndex();

  return (
    <div className="absolute top-0 bottom-0 pointer-events-none z-30"
      style={{ left:pl(nowIndex), borderLeft:'2px dashed #F7A800' }}>
      {showLabel && (
        <div className="absolute -top-px left-0" style={{ transform:'translateX(-50%)' }}>
          <div className="flex flex-col items-center">
            <span className="font-bold px-1.5 py-px rounded whitespace-nowrap"
              style={{ fontSize:'8px', background:'#F7A800', color:'#1B2A4A' }}>
              Now
            </span>
            <div style={{ width:0, height:0, borderLeft:'4px solid transparent', borderRight:'4px solid transparent', borderTop:'5px solid #F7A800' }} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────
export default function ApprenticeshipTimeline() {
  const [groups, setGroups]         = useState<Group[]>(INITIAL_GROUPS);
  const [modal,  setModal]          = useState<ModalState>({ open: false });
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirm | null>(null);
  const currentTimelineLabel = getCurrentTimelineLabel();

  const handleSave = (groupIdx: number, row: CRow, prevGroupIdx?: number) => {
    setGroups(prev => {
      const next = prev.map(g => ({ ...g, rows: [...g.rows] }));
      if (modal.open && modal.mode === 'edit') {
        const pgi = prevGroupIdx ?? groupIdx;
        next[pgi].rows.splice(modal.rowIdx, 1);
        const insertAt = (groupIdx === pgi) ? modal.rowIdx : next[groupIdx].rows.length;
        next[groupIdx].rows.splice(insertAt, 0, row);
      } else {
        next[groupIdx].rows.push(row);
      }
      return next;
    });
    setModal({ open: false });
  };

  const handleDelete = (groupIdx: number, rowIdx: number) => {
    setGroups(prev => prev.map((g, gi) =>
      gi === groupIdx ? { ...g, rows: g.rows.filter((_, ri) => ri !== rowIdx) } : g
    ));
    setDeleteConfirm(null);
  };

  const totalCohorts = groups.reduce((s, g) => s + g.rows.length, 0);

  return (
    <div className="min-h-screen bg-kbc-bg font-sans">
      <TopNav />

      {/* ── PAGE HEADER ─────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-screen-xl mx-auto px-4 md:px-6 py-4">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 mb-3 text-xs text-gray-400">
            <Link to="/" className="hover:text-kbc-navy transition-colors cursor-pointer">Home</Link>
            <i className="ri-arrow-right-s-line" />
            <Link to="/events" className="hover:text-kbc-navy transition-colors cursor-pointer">Events</Link>
            <i className="ri-arrow-right-s-line" />
            <span className="text-kbc-navy font-semibold">Cohort Timeline</span>
          </div>

          <div className="flex items-center justify-between gap-4 flex-wrap">
            {/* Title block */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                style={{ background:'#1B2A4A' }}>
                <i className="ri-time-line text-white text-base" />
              </div>
              <div>
                <h1 className="text-base font-extrabold text-kbc-navy leading-tight">
                  Apprenticeships Cohort Timeline
                </h1>
                <p className="text-xs text-gray-400 mt-0.5">Programme Structure 2024 – 2027</p>
              </div>
              {/* Stats pills */}
              <div className="hidden md:flex items-center gap-2 ml-3">
                {[
                  { label:`${groups.length} Programmes` },
                  { label:`${totalCohorts} Cohorts` },
                  { label:`${currentTimelineLabel} Live` },
                ].map((s, i) => (
                  <span key={i} className="px-2.5 py-1 rounded-full text-xs font-semibold border"
                    style={{ background:'#F0F4FF', color:'#2E4482', borderColor:'#D5DFF7' }}>
                    {s.label}
                  </span>
                ))}
              </div>
            </div>

            {/* Add cohort button */}
            <div className="min-w-[220px]">
              <button
                onClick={() => setModal({ open: true, mode: 'add', defaultGroupIdx: 0 })}
                className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-2xl bg-kbc-navy px-5 py-3 text-sm font-bold text-white shadow-[0_14px_34px_-18px_rgba(27,42,74,0.55)] transition-all hover:bg-kbc-navy-light hover:shadow-[0_18px_40px_-18px_rgba(27,42,74,0.65)]"
              >
                <i className="ri-add-line text-base" />
                Add New Cohort
              </button>
            </div>
          </div>
        </div>
        {/* Amber accent underline */}
        <div className="h-0.5 w-full" style={{ background:'linear-gradient(to right, #F7A800 0%, #F7A800 180px, #E5E7EB 180px)' }} />
      </div>

      <main className="max-w-screen-xl mx-auto px-4 md:px-6 py-5 space-y-4">

        {/* GANTT CARD */}
        <div className="bg-white rounded-xl overflow-hidden border border-gray-200">
          <div className="overflow-x-auto">
            <div style={{ minWidth:'1040px' }}>
              <TimelineHeaders />

              {groups.map((grp, gi) => (
                <div key={gi} className="flex"
                  style={{ borderBottom:`1px solid ${grp.color}30`, background:grp.rowBg }}>

                  {/* Clean left programme label — no chevron, just a left border accent */}
                  <div className="shrink-0 flex flex-col items-start justify-center px-4 py-2 border-r border-gray-200 relative"
                    style={{ width:LEFT_W, minHeight:`${Math.max(grp.rows.length,1)*52}px`, background:'#fff' }}>
                    {/* Colour accent strip */}
                    <div className="absolute left-0 top-0 bottom-0 w-1 rounded-r"
                      style={{ background: grp.color }} />
                    <p className="font-extrabold leading-tight pl-1" style={{ fontSize:'10.5px', color: grp.color }}>
                      {grp.name.split('\n').map((l, i) => <span key={i} className="block">{l}</span>)}
                    </p>
                    <p className="font-medium mt-0.5 pl-1" style={{ fontSize:'9px', color:'#9CA3AF' }}>{grp.sub}</p>
                  </div>

                  {/* Cohort rows */}
                  <div className="flex-1">
                    {grp.rows.length === 0 && (
                      <div className="flex items-center justify-center" style={{ height:'52px' }}>
                        <span className="text-xs text-gray-300 italic">No cohorts yet</span>
                      </div>
                    )}
                    {grp.rows.map((row, ri) => {
                      const first  = row.blks[0];
                      const last   = row.blks[row.blks.length - 1];
                      const rowEnd = last ? last.s + last.d : 0;
                      const isDeleting = deleteConfirm?.groupIdx === gi && deleteConfirm?.rowIdx === ri;

                      return (
                        <div key={ri} className="relative group/row"
                          style={{ height:'52px', borderTop: ri > 0 ? `1px solid ${grp.color}18` : 'none' }}>
                          <NowLine showLabel={gi===0 && ri===0} />

                          {/* Quarter stripe */}
                          <div className="absolute inset-0 flex pointer-events-none">
                            {YEAR_CFG.map(y =>
                              y.qts.map((qt, qi) => (
                                <div key={`${y.yr}${qt.q}`}
                                  style={{ flex:qt.s, background:qi%2!==0?'rgba(0,0,0,0.010)':'transparent' }} />
                              ))
                            )}
                          </div>

                          {/* Month gridlines */}
                          <div className="absolute inset-0 flex pointer-events-none">
                            {MONTH_LABELS.map((_, i) => (
                              <div key={i} className="flex-1 border-r"
                                style={{ borderColor:i%3===2?'rgba(0,0,0,0.05)':'rgba(0,0,0,0.02)' }} />
                            ))}
                          </div>

                          {/* Start date label */}
                          {first && first.s >= 0 && (
                            <div className="absolute z-20"
                              style={{ left:pl(first.s), top:'1px', transform:'translateX(-50%)', whiteSpace:'nowrap' }}>
                              <span className="font-semibold rounded px-1.5 py-px leading-none"
                                style={{ fontSize:'7px', background:grp.color, color:'#fff', display:'inline-block' }}>
                                {row.dateLbl}
                              </span>
                            </div>
                          )}

                          {/* Module bars */}
                          {row.blks.map((blk, bi) => {
                            const mod  = MS[blk.mod];
                            const wPct = pwn(blk.s, blk.d);
                            return (
                              <div key={bi} title={`${row.label} · ${mod.lbl}`}
                                className="absolute flex items-center justify-center overflow-hidden z-10 cursor-default"
                                style={{
                                  left:pl(blk.s), width:pw(blk.s,blk.d),
                                  top:'14px', bottom:'10px',
                                  background:mod.bg,
                                  borderRadius:'3px',
                                }}>
                                {wPct > 4 && (
                                  <span className="font-semibold truncate select-none px-1"
                                    style={{ color:mod.tx, fontSize:'8px', lineHeight:1.1 }}>
                                    {wPct > 7 ? mod.lbl : mod.lbl.split(' ')[0]}
                                  </span>
                                )}
                              </div>
                            );
                          })}

                          {/* Cohort label + edit/delete */}
                          {last && (
                            <div className="absolute z-20 flex items-center gap-1"
                              style={{ left:`calc(${pl(rowEnd)} + 4px)`, top:'50%', transform:'translateY(-50%)', whiteSpace:'nowrap' }}>
                              <span className="font-bold text-white rounded px-2 py-0.5"
                                style={{ fontSize:'8.5px', background:grp.color }}>
                                {row.label}
                              </span>
                              <div className="flex items-center gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity">
                                <button
                                  onClick={() => setModal({ open:true, mode:'edit', groupIdx:gi, rowIdx:ri, row })}
                                  className="w-6 h-6 flex items-center justify-center rounded-md cursor-pointer transition-colors"
                                  style={{ background:grp.color, filter:'brightness(1.25)' }}
                                  title="Edit">
                                  <i className="ri-edit-line" style={{ fontSize:'9px', color:'#fff' }} />
                                </button>
                                <button
                                  onClick={() => setDeleteConfirm({ groupIdx:gi, rowIdx:ri })}
                                  className="w-7 h-7 flex items-center justify-center rounded-md cursor-pointer bg-gray-200 text-gray-500 transition-all hover:scale-105 hover:bg-red-500 hover:text-white"
                                  title="Delete">
                                  <i className="ri-delete-bin-line text-[10px]" />
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Delete confirm overlay */}
                          {isDeleting && (
                            <div className="absolute inset-0 z-40 flex items-center justify-end pr-4"
                              style={{ background:'rgba(249,250,251,0.97)' }}>
                              <div className="flex items-center gap-2">
                                <span className="text-gray-600 font-medium text-xs">
                                  Remove <strong className="text-kbc-navy">{row.label}</strong>?
                                </span>
                                <button onClick={() => handleDelete(gi, ri)}
                                  className="px-3 py-1 rounded text-xs font-bold text-white cursor-pointer"
                                  style={{ background:'#1B2A4A' }}>
                                  Remove
                                </button>
                                <button onClick={() => setDeleteConfirm(null)}
                                  className="px-3 py-1 rounded text-xs font-semibold text-gray-500 bg-gray-200 hover:bg-gray-300 cursor-pointer">
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Legend */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 border-t border-gray-100 bg-gray-50">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider shrink-0">Legend</span>
                {(Object.entries(MS) as [string, { lbl:string; bg:string; tx:string }][]).map(([k, v]) => (
                  <span key={k} className="flex items-center gap-1.5 whitespace-nowrap" style={{ fontSize:'10px', color:'#6B7280' }}>
                    <span className="inline-block rounded shrink-0" style={{ width:18, height:9, background:v.bg }} />
                    {v.lbl}
                  </span>
                ))}
                <span className="flex items-center gap-1.5 whitespace-nowrap ml-auto" style={{ fontSize:'10px', color:'#6B7280' }}>
                  <span className="inline-block shrink-0" style={{ width:14, borderTop:'2px dashed #F7A800' }} />
                  {`Now (${currentTimelineLabel})`}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Session Schedule Table */}
        <ScheduleTable />

      </main>
      <Footer />

      {modal.open && (
        <CohortModal
          mode={modal.mode}
          groups={groups}
          initialGroupIdx={modal.mode === 'add' ? modal.defaultGroupIdx : modal.groupIdx}
          initialRow={modal.mode === 'edit' ? modal.row : undefined}
          onSave={handleSave}
          onClose={() => setModal({ open: false })}
        />
      )}
    </div>
  );
}
