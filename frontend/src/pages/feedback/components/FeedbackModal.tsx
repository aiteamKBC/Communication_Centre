import { useRef, useState } from 'react';
import ModernSelect from '../../../components/feature/ModernSelect';

const categories = [
  'General Feedback',
  'Platform Suggestion',
  'Content Issue',
  'Report a Concern',
  'IT Issue',
  'Safeguarding Concern',
  'HR Query',
];

const departmentOptions = [
  'Select department...',
  'Leadership & Executive',
  'Human Resources',
  'Finance',
  'Quality & Standards',
  'Marketing & Partnerships',
  'IT Services',
  'Operations & Estates',
  'Compliance & Risk',
];

interface FeedbackModalProps {
  onClose: () => void;
}

const initialForm = {
  name: '',
  email: '',
  category: 'General Feedback',
  department: '',
  priority: 'normal',
  message: '',
  anonymous: false,
};

export default function FeedbackModal({ onClose }: FeedbackModalProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [form, setForm] = useState(initialForm);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.message.trim()) return;
    setSubmitted(true);
    setTimeout(() => {
      onClose();
      setForm(initialForm);
      setSubmitted(false);
    }, 2800);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
    >
      <div className="modal-backdrop" />
      <div
        ref={panelRef}
        className="relative bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {submitted ? (
          <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-5">
              <i className="ri-check-double-line text-3xl text-kbc-green" />
            </div>
            <h3 className="text-lg font-bold text-kbc-navy mb-2">Feedback Received</h3>
            <p className="text-gray-500 text-sm leading-relaxed max-w-xs">
              Thank you for sharing your feedback. It will be reviewed by the appropriate team within 5 working days.
            </p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-kbc-navy/5 rounded-lg flex items-center justify-center shrink-0">
                  <i className="ri-feedback-line text-kbc-navy text-base" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-kbc-navy">Submit Feedback</h2>
                  <p className="text-xs text-gray-400 mt-0.5">All submissions are reviewed by the leadership team</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-kbc-navy hover:bg-gray-100 cursor-pointer transition-colors"
              >
                <i className="ri-close-line text-lg" />
              </button>
            </div>

            {/* Body */}
            <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-4">
              {/* Anonymous Toggle */}
              <div className="flex items-center gap-3 p-3.5 bg-gray-50 rounded-xl">
                <input
                  type="checkbox"
                  id="anon-modal"
                  checked={form.anonymous}
                  onChange={(e) => setForm({ ...form, anonymous: e.target.checked })}
                  className="w-4 h-4 accent-kbc-navy cursor-pointer"
                />
                <label htmlFor="anon-modal" className="text-sm font-medium text-kbc-navy cursor-pointer flex-1">
                  Submit anonymously
                </label>
                <span className="text-xs text-gray-400">Identity not recorded</span>
              </div>

              {/* Name & Email */}
              {!form.anonymous && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1.5">Your Name</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="Full name"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:border-kbc-navy"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1.5">Email Address</label>
                    <input
                      type="email"
                      name="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      placeholder="your.name@kbc.ac.uk"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:border-kbc-navy"
                    />
                  </div>
                </div>
              )}

              {/* Category & Department */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1.5">Category *</label>
                  <ModernSelect
                    value={form.category}
                    onChange={(value) => setForm({ ...form, category: value })}
                    options={categories.map((category) => ({ value: category, label: category }))}
                    className="w-full"
                    buttonClassName="min-h-[44px] rounded-2xl border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8faff_100%)] px-4 py-2.5 text-sm shadow-[0_12px_26px_-18px_rgba(27,42,74,0.35)]"
                    menuMinWidth={220}
                    boundaryRef={panelRef}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1.5">Your Department</label>
                  <ModernSelect
                    value={form.department}
                    onChange={(value) => setForm({ ...form, department: value })}
                    options={departmentOptions.map((department) => ({
                      value: department === 'Select department...' ? '' : department,
                      label: department,
                    }))}
                    placeholder="Select department..."
                    className="w-full"
                    buttonClassName="min-h-[44px] rounded-2xl border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8faff_100%)] px-4 py-2.5 text-sm shadow-[0_12px_26px_-18px_rgba(27,42,74,0.35)]"
                    menuMinWidth={240}
                    boundaryRef={panelRef}
                  />
                </div>
              </div>

              {/* Priority */}
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-2">Priority *</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {[
                    { value: 'urgent', label: 'Urgent', color: 'border-kbc-red text-kbc-red bg-red-50' },
                    { value: 'high', label: 'High', color: 'border-kbc-amber text-yellow-700 bg-yellow-50' },
                    { value: 'normal', label: 'Normal', color: 'border-kbc-green text-kbc-green bg-green-50' },
                    { value: 'low', label: 'Low', color: 'border-gray-300 text-gray-500 bg-gray-50' },
                  ].map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setForm({ ...form, priority: p.value })}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border cursor-pointer whitespace-nowrap transition-all ${form.priority === p.value ? p.color : 'border-gray-200 text-gray-400 bg-white hover:bg-gray-50'}`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Message */}
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1.5">Message *</label>
                <textarea
                  value={form.message}
                  onChange={(e) => {
                    if (e.target.value.length <= 500) setForm({ ...form, message: e.target.value });
                  }}
                  placeholder="Please describe your feedback, suggestion, or concern in detail..."
                  rows={4}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 resize-none focus:outline-none focus:border-kbc-navy"
                  required
                />
                <p className={`text-xs text-right mt-1 ${form.message.length >= 450 ? 'text-kbc-red' : 'text-gray-400'}`}>
                  {form.message.length}/500
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pb-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 border border-gray-200 text-gray-600 font-semibold text-sm py-2.5 rounded-lg cursor-pointer hover:bg-gray-50 whitespace-nowrap"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!form.message.trim()}
                  className="flex-1 bg-kbc-navy text-white font-bold text-sm py-2.5 rounded-lg cursor-pointer hover:bg-kbc-navy-light disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                >
                  Submit Feedback
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
