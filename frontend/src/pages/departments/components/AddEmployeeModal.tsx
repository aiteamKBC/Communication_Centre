import { useEffect, useRef, useState } from 'react';
import type { Employee } from '../../../mocks/employees';
import { departments } from '../../../mocks/departments';

interface Props {
  open: boolean;
  onClose: () => void;
  employees: Employee[];
  editTarget: Employee | null;
  onSave: (emp: Employee) => void;
  saving?: boolean;
}

const empty = (): Omit<Employee, 'id'> => ({
  name: '',
  title: '',
  department: '',
  email: '',
  phone: '',
  avatar: '',
  reportsTo: null,
});

export default function AddEmployeeModal({ open, onClose, employees, editTarget, onSave, saving = false }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState(empty());
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setForm(editTarget ? { ...editTarget } : empty());
    setErrors({});
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [open, editTarget]);

  if (!open) return null;

  const set = (k: keyof typeof form, v: string | null) =>
    setForm(prev => ({ ...prev, [k]: v }));

  // When department changes, clear reportsTo if the current manager isn't in the new dept
  const setDepartment = (dept: string) => {
    setForm(prev => {
      const managerStillValid = prev.reportsTo &&
        employees.some(e => e.id === prev.reportsTo && e.department === dept);
      return { ...prev, department: dept, reportsTo: managerStillValid ? prev.reportsTo : null };
    });
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Name is required';
    if (!form.title.trim()) e.title = 'Job title is required';
    if (!form.department) e.department = 'Department is required';
    return e;
  };

  const handleSave = () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    onSave({
      ...(editTarget ?? { id: `e${Date.now()}` }),
      ...form,
    } as Employee);
    onClose();
  };

  // Reports-to options: same department + always include Directors, excluding self
  const reportsToOptions = employees.filter(e =>
    (!editTarget || e.id !== editTarget.id) &&
    (e.department === 'Director' || (form.department ? e.department === form.department : true))
  );

  const deptColor = departments.find(d => d.name === form.department)?.color ?? '#1B2A4A';

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.5)' }}
      onMouseDown={e => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: form.department ? deptColor : '#1B2A4A' }}>
              <i className="ri-user-add-line text-white" style={{ fontSize: '13px' }} />
            </div>
            <div>
              <h2 className="font-extrabold text-gray-900 leading-none" style={{ fontSize: '14px' }}>
                {editTarget ? 'Edit Employee' : 'Add Employee'}
              </h2>
              {form.department && (
                <p className="leading-none mt-0.5 font-semibold" style={{ fontSize: '10px', color: deptColor }}>
                  {form.department}
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
            <i className="ri-close-line" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-5 space-y-4">

          {/* Name */}
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1.5">Full Name *</label>
            <input
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="e.g. Jane Smith"
              className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none transition-colors"
              style={{ borderColor: errors.name ? '#EF4444' : '#E5E7EB' }}
            />
            {errors.name && <p className="text-xs mt-1 text-red-500">{errors.name}</p>}
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1.5">Job Title *</label>
            <input
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="e.g. Senior Trainer"
              className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none transition-colors"
              style={{ borderColor: errors.title ? '#EF4444' : '#E5E7EB' }}
            />
            {errors.title && <p className="text-xs mt-1 text-red-500">{errors.title}</p>}
          </div>

          {/* Department */}
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1.5">Department *</label>
            <div className="grid grid-cols-2 gap-2">
              {departments.map(d => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setDepartment(d.name)}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-all text-left"
                  style={form.department === d.name
                    ? { background: d.color, color: '#fff', borderColor: d.color }
                    : { background: `${d.color}10`, color: d.color, borderColor: `${d.color}30` }}
                >
                  <i className={d.icon} style={{ fontSize: '11px' }} />
                  {d.name}
                </button>
              ))}
            </div>
            {errors.department && <p className="text-xs mt-1.5 text-red-500">{errors.department}</p>}
          </div>

          {/* Reports To — filtered to same department */}
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1.5">
              Reports To
              {form.department && (
                <span className="ml-1 font-normal text-gray-400">(from {form.department})</span>
              )}
            </label>
            {reportsToOptions.length === 0 && form.department ? (
              <p className="text-xs text-gray-400 italic px-1">
                No other employees in {form.department} yet
              </p>
            ) : (
              <select
                value={form.reportsTo ?? ''}
                onChange={e => set('reportsTo', e.target.value || null)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none bg-white transition-colors"
              >
                <option value="">— None (top of chart) —</option>
                {reportsToOptions.map(m => (
                  <option key={m.id} value={m.id}>{m.name} · {m.title}</option>
                ))}
              </select>
            )}
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1.5">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={e => set('email', e.target.value)}
              placeholder="jane.smith@kbc.ac.uk"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none transition-colors"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1.5">Phone</label>
            <input
              value={form.phone}
              onChange={e => set('phone', e.target.value)}
              placeholder="01234 567890"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none transition-colors"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-500 hover:bg-gray-100 transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 rounded-xl text-sm font-bold text-white transition-all flex items-center gap-1.5 disabled:opacity-60 shadow-sm"
            style={{ background: form.department ? deptColor : '#1B2A4A' }}>
            {saving && <i className="ri-loader-4-line animate-spin" />}
            {editTarget ? 'Save Changes' : 'Add Employee'}
          </button>
        </div>
      </div>
    </div>
  );
}
