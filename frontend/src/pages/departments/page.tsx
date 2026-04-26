import { useMemo, useState } from 'react';
import TopNav from '../../components/feature/TopNav';
import Footer from '../../components/feature/Footer';
import ModernSelect from '../../components/feature/ModernSelect';
import useAccessControl from '../../hooks/useAccessControl';
import type { Employee } from '../../mocks/employees';
import { departments } from '../../mocks/departments';
import AddEmployeeModal from './components/AddEmployeeModal';
import { useEmployees } from './useEmployees';

// ── helpers ───────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  return name.split(' ').filter(Boolean).map(p => p[0]).join('').slice(0, 2).toUpperCase();
}
function getDeptColor(dept: string) {
  return departments.find(d => d.name === dept)?.color ?? '#64748B';
}

interface TreeNode { emp: Employee; children: TreeNode[] }

function buildTree(list: Employee[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  for (const emp of list) map.set(emp.id, { emp, children: [] });
  const roots: TreeNode[] = [];
  for (const node of map.values()) {
    if (!node.emp.reportsTo || !map.has(node.emp.reportsTo)) roots.push(node);
    else map.get(node.emp.reportsTo)!.children.push(node);
  }
  return roots;
}

// ── layout constants ──────────────────────────────────────────────────────────
const CARD_W      = 220;
const SIBLING_GAP = 40;
const V_TRUNK     = 28;
const V_BRANCH    = 20;
const LINE_CLR    = '#CBD5E1';

// Recursively computes the total pixel width a subtree occupies.
function subtreeWidth(node: TreeNode): number {
  if (node.children.length === 0) return CARD_W;
  const childrenTotalW = node.children.reduce((s, c) => s + subtreeWidth(c), 0)
    + (node.children.length - 1) * SIBLING_GAP;
  return Math.max(CARD_W, childrenTotalW);
}

// ── card ──────────────────────────────────────────────────────────────────────

function OrgCard({ emp, editMode, onEdit, onDelete }: {
  emp: Employee;
  editMode: boolean;
  onEdit: (e: Employee) => void;
  onDelete: (id: string) => void;
}) {
  const color = getDeptColor(emp.department);
  return (
    <div
      className="group relative bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
      style={{ width: CARD_W }}
    >
      <div className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full" style={{ background: color }} />
      <div className="pl-5 pr-4 py-4">
        <div className="flex items-start gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold shrink-0 text-sm mt-0.5"
            style={{ background: color }}
          >
            {getInitials(emp.name)}
          </div>
          <div style={{ minWidth: 0 }}>
            <p className="text-sm font-bold text-gray-900 leading-snug" style={{ wordBreak: 'break-word' }}>{emp.name}</p>
            <p className="text-xs text-gray-500 leading-snug mt-0.5" style={{ wordBreak: 'break-word' }}>{emp.title}</p>
            <span
              className="inline-block mt-2 px-2 py-0.5 rounded-full text-xs font-semibold leading-none"
              style={{ background: `${color}18`, color }}
            >
              {emp.department}
            </span>
            {emp.email && (
              <p className="mt-1.5 text-gray-400 text-xs" style={{ wordBreak: 'break-all' }}>
                <i className="ri-mail-line mr-1" />{emp.email}
              </p>
            )}
          </div>
        </div>
      </div>
      {editMode && (
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => onEdit(emp)}
            className="w-6 h-6 flex items-center justify-center rounded-lg bg-white shadow border border-gray-100 text-gray-400 hover:text-blue-600 hover:border-blue-200 transition-colors">
            <i className="ri-edit-line" style={{ fontSize: '10px' }} />
          </button>
          <button onClick={() => onDelete(emp.id)}
            className="w-6 h-6 flex items-center justify-center rounded-lg bg-white shadow border border-gray-100 text-gray-400 hover:text-red-500 hover:border-red-200 transition-colors">
            <i className="ri-delete-bin-line" style={{ fontSize: '10px' }} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── recursive tree node ───────────────────────────────────────────────────────

function OrgNode({ node, editMode, onEdit, onDelete }: {
  node: TreeNode;
  editMode: boolean;
  onEdit: (e: Employee) => void;
  onDelete: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const color = getDeptColor(node.emp.department);
  const hasChildren = node.children.length > 0;
  const myW = subtreeWidth(node);

  const childrenRowW = hasChildren
    ? node.children.reduce((s, c) => s + subtreeWidth(c), 0)
      + (node.children.length - 1) * SIBLING_GAP
    : 0;

  // Horizontal bar goes from centre of first child column to centre of last child column
  const firstChildW = hasChildren ? subtreeWidth(node.children[0]) : 0;
  const lastChildW  = hasChildren ? subtreeWidth(node.children[node.children.length - 1]) : 0;
  const barW = node.children.length > 1
    ? childrenRowW - firstChildW / 2 - lastChildW / 2
    : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: myW }}>

      {/* card */}
      <div style={{ position: 'relative', width: CARD_W }}>
        <OrgCard emp={node.emp} editMode={editMode} onEdit={onEdit} onDelete={onDelete} />
        {hasChildren && (
          <button
            onClick={() => setCollapsed(c => !c)}
            style={{
              position: 'absolute', bottom: -12, left: '50%',
              transform: 'translateX(-50%)',
              width: 24, height: 24, borderRadius: '50%',
              border: '2px solid white', background: color, color: '#fff',
              fontSize: 13, cursor: 'pointer', zIndex: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 6px rgba(0,0,0,.15)',
            }}
          >
            <i className={collapsed ? 'ri-add-line' : 'ri-subtract-line'} />
          </button>
        )}
      </div>

      {hasChildren && !collapsed && (
        <>
          {/* vertical trunk */}
          <div style={{ width: 2, height: V_TRUNK, background: LINE_CLR }} />

          {/* horizontal bar */}
          {node.children.length > 1 && (
            <div style={{ width: barW, height: 2, background: LINE_CLR }} />
          )}

          {/* children */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: SIBLING_GAP }}>
            {node.children.map(child => (
              <div key={child.emp.id}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: subtreeWidth(child) }}>
                <div style={{ width: 2, height: V_BRANCH, background: LINE_CLR }} />
                <OrgNode node={child} editMode={editMode} onEdit={onEdit} onDelete={onDelete} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-32 text-gray-300">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 bg-gray-100">
        <i className="ri-group-line text-3xl" />
      </div>
      <p className="text-sm font-semibold text-gray-400">No employees yet</p>
      <p className="text-xs mt-1">Click "Add Employee" to get started</p>
    </div>
  );
}

function OrgChartSkeleton() {
  return (
    <div className="flex justify-center overflow-auto px-6 py-12">
      <div className="min-w-[920px] animate-pulse">
        <div className="flex justify-center">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm" style={{ width: CARD_W }}>
            <div className="relative pl-5 pr-4 py-4">
              <div className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full bg-slate-200" />
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 shrink-0 rounded-xl bg-slate-200" />
                <div className="min-w-0 flex-1">
                  <div className="h-4 w-28 rounded-full bg-slate-200" />
                  <div className="mt-2 h-3 w-20 rounded-full bg-slate-100" />
                  <div className="mt-3 h-5 w-24 rounded-full bg-slate-100" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto h-8 w-0.5 bg-slate-200" />
        <div className="mx-auto h-0.5 w-[560px] bg-slate-200" />

        <div className="mt-5 flex justify-center gap-10">
          {[0, 1, 2].map((item) => (
            <div key={item} className="flex flex-col items-center">
              <div className="h-5 w-0.5 bg-slate-200" />
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm" style={{ width: CARD_W }}>
                <div className="relative pl-5 pr-4 py-4">
                  <div className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full bg-slate-200" />
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 shrink-0 rounded-xl bg-slate-200" />
                    <div className="min-w-0 flex-1">
                      <div className="h-4 w-24 rounded-full bg-slate-200" />
                      <div className="mt-2 h-3 w-28 rounded-full bg-slate-100" />
                      <div className="mt-3 h-5 w-20 rounded-full bg-slate-100" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function DepartmentsPage() {
  const { adminAccess } = useAccessControl();
  const { employees, loading, error, addEmployee, updateEmployee, deleteEmployee } = useEmployees();
  const [editMode,   setEditMode]   = useState(false);
  const [modalOpen,  setModalOpen]  = useState(false);
  const [editTarget, setEditTarget] = useState<Employee | null>(null);
  const [search,     setSearch]     = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [saving,     setSaving]     = useState(false);
  const departmentOptions = [{ value: '', label: 'All Departments' }, ...departments.map(d => ({ value: d.name, label: d.name }))];

  const filtered = useMemo(() => {
    let list = employees;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(e =>
        e.name.toLowerCase().includes(q) ||
        e.title.toLowerCase().includes(q) ||
        e.department.toLowerCase().includes(q)
      );
    }
    if (deptFilter) list = list.filter(e => e.department === deptFilter);
    return list;
  }, [employees, search, deptFilter]);

  const roots = useMemo(() => buildTree(filtered), [filtered]);

  const handleSave = async (emp: Employee) => {
    setSaving(true);
    try {
      const { id, avatar, ...fields } = emp;
      if (editTarget) await updateEmployee(id, fields);
      else            await addEmployee(fields);
    } finally { setSaving(false); }
  };

  const openAdd  = () => { setEditTarget(null); setModalOpen(true); };
  const openEdit = (emp: Employee) => { setEditTarget(emp); setModalOpen(true); };

  return (
    <div className="min-h-screen bg-gray-50 font-sans flex flex-col">
      <TopNav />

      <AddEmployeeModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        employees={employees}
        editTarget={editTarget}
        onSave={emp => { void handleSave(emp); }}
        saving={saving}
      />

      <div className="flex-1 flex flex-col">
        {/* header */}
        <div className="bg-white border-b border-gray-100 shadow-sm">
          <div className="max-w-screen-2xl mx-auto px-6 py-4 flex flex-wrap items-center gap-3">
            <div className="mr-auto flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#1B2A4A' }}>
                <i className="ri-organization-chart text-white" style={{ fontSize: '14px' }} />
              </div>
              <div>
                <h1 className="font-extrabold text-gray-900 leading-none" style={{ fontSize: '15px' }}>Organisation Chart</h1>
                <p className="text-gray-400 leading-none mt-0.5" style={{ fontSize: '10px' }}>
                  {loading ? '…' : `${employees.length} people · ${departments.length} departments`}
                </p>
              </div>
            </div>

            <div className="relative">
              <i className="ri-search-line absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-300" style={{ fontSize: '12px' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search people…"
                className="border border-gray-200 rounded-xl pl-7 pr-3 py-2 text-xs outline-none focus:border-blue-300 bg-white"
                style={{ width: 180 }} />
            </div>

            <ModernSelect
              value={deptFilter}
              onChange={setDeptFilter}
              options={departmentOptions}
              className="min-w-[190px]"
              buttonClassName="min-h-[42px] rounded-xl border-gray-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8faff_100%)] px-4 py-2 text-xs shadow-[0_12px_26px_-18px_rgba(27,42,74,0.35)]"
              menuMinWidth={220}
              renderOption={(option, selected) => {
                const deptMeta = departments.find(d => d.name === option.value);
                return (
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: deptMeta?.color || '#CBD5E1' }}
                    />
                    <span className={`truncate ${selected ? 'text-white' : ''}`}>{option.label}</span>
                  </span>
                );
              }}
              renderValue={(option) => {
                const deptMeta = departments.find(d => d.name === option?.value);
                return (
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: deptMeta?.color || '#CBD5E1' }}
                    />
                    <span className="truncate">{option?.label ?? 'All Departments'}</span>
                  </span>
                );
              }}
            />

            {adminAccess && (
              <button onClick={() => setEditMode(m => !m)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all"
                style={editMode
                  ? { background: '#1B2A4A', color: '#fff', borderColor: '#1B2A4A' }
                  : { background: '#fff', color: '#64748B', borderColor: '#E2E8F0' }}>
                <i className={editMode ? 'ri-check-line' : 'ri-pencil-line'} />
                {editMode ? 'Done' : 'Edit Chart'}
              </button>
            )}

            {adminAccess && (
              <button onClick={openAdd}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white hover:opacity-90 shadow-sm"
                style={{ background: '#1B2A4A' }}>
                <i className="ri-user-add-line" /> Add Employee
              </button>
            )}
          </div>

          {/* dept pills */}
          <div className="max-w-screen-2xl mx-auto px-6 pb-3 flex items-center gap-2 flex-wrap">
            {departments.map(d => (
              <button key={d.id}
                onClick={() => setDeptFilter(deptFilter === d.name ? '' : d.name)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all"
                style={deptFilter === d.name
                  ? { background: d.color, color: '#fff', borderColor: d.color }
                  : { background: `${d.color}12`, color: d.color, borderColor: `${d.color}30` }}>
                <i className={d.icon} style={{ fontSize: '10px' }} />{d.name}
              </button>
            ))}
            {deptFilter && (
              <button onClick={() => setDeptFilter('')}
                className="flex items-center gap-1 px-2 py-1 rounded-full text-xs text-gray-400 hover:text-gray-600 border border-gray-200">
                <i className="ri-close-line" /> Clear
              </button>
            )}
          </div>

          {editMode && (
            <div className="max-w-screen-2xl mx-auto px-6 pb-3">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold"
                style={{ background: '#FEF9C3', color: '#854D0E' }}>
                <i className="ri-pencil-line" /> Edit mode — hover any card to edit or remove
              </span>
            </div>
          )}
        </div>

        {/* chart canvas */}
        <div className="flex-1 overflow-auto" style={{ background: '#F8FAFC' }}>
          {loading ? (
            <OrgChartSkeleton />
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-40 text-red-400">
              <i className="ri-error-warning-line text-3xl mb-2" /><p className="text-sm">{error}</p>
            </div>
          ) : roots.length === 0 ? (
            <EmptyState />
          ) : (
            <div style={{ padding: 48, display: 'flex', gap: 64, justifyContent: 'center', alignItems: 'flex-start', minWidth: 'max-content', margin: '0 auto' }}>
              {roots.map(root => (
                <OrgNode key={root.emp.id} node={root} editMode={editMode}
                  onEdit={openEdit}
                  onDelete={id => { void deleteEmployee(id); }} />
              ))}
            </div>
          )}
        </div>
      </div>

      <Footer />
    </div>
  );
}

