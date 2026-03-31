import { useEffect, useState } from 'react';
import ModalPortal from '../../../components/feature/ModalPortal';
import ModernSelect, { type ModernSelectOption } from '../../../components/feature/ModernSelect';

const categories = [
  'General Feedback',
  'Platform Suggestion',
  'Content Issue',
  'Report a Concern',
  'IT Issue',
  'Safeguarding Concern',
  'HR Query',
];

const categoryOptions: ModernSelectOption[] = categories.map(item => ({ label: item, value: item }));
const departmentOptions: ModernSelectOption[] = [
  { label: 'Leadership & Executive', value: 'Leadership & Executive' },
  { label: 'Human Resources', value: 'Human Resources' },
  { label: 'Finance', value: 'Finance' },
  { label: 'Quality & Standards', value: 'Quality & Standards' },
  { label: 'Marketing & Partnerships', value: 'Marketing & Partnerships' },
  { label: 'IT Services', value: 'IT Services' },
  { label: 'Operations & Estates', value: 'Operations & Estates' },
  { label: 'Compliance & Risk', value: 'Compliance & Risk' },
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
  const [form, setForm] = useState(initialForm);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

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
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="modal-backdrop absolute inset-0 bg-slate-950/35 backdrop-blur-[7px]"
          onClick={onClose}
        />
        <div
          data-modal-surface
          className="modal-surface relative bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {submitted ? (
            <div className="flex flex-1 flex-col items-center justify-center px-8 py-16 text-center">
              <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
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
              <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-kbc-navy/5">
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
              <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto px-6 py-5">
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-3.5">
                      <input
                        type="checkbox"
                        id="anon-modal"
                        checked={form.anonymous}
                        onChange={(e) => setForm({ ...form, anonymous: e.target.checked })}
                        className="h-4 w-4 cursor-pointer accent-kbc-navy"
                      />
                      <label htmlFor="anon-modal" className="flex-1 cursor-pointer text-sm font-medium text-kbc-navy">
                        Submit anonymously
                      </label>
                      <span className="text-xs text-gray-400">Identity not recorded</span>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-1.5 block text-xs font-semibold text-kbc-navy">Category *</label>
                        <ModernSelect
                          value={form.category}
                          onChange={(value) => setForm({ ...form, category: value })}
                          options={categoryOptions}
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-xs font-semibold text-kbc-navy">Priority *</label>
                        <div className="flex flex-wrap items-center gap-2">
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
                              className={`rounded-full border px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-all ${form.priority === p.value ? p.color : 'border-gray-200 text-gray-400 bg-white hover:bg-gray-50'}`}
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {!form.anonymous && (
                      <>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <div>
                            <label className="mb-1.5 block text-xs font-semibold text-kbc-navy">Your Name</label>
                            <input
                              type="text"
                              value={form.name}
                              onChange={(e) => setForm({ ...form, name: e.target.value })}
                              placeholder="Full name"
                              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-700 focus:border-kbc-navy focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="mb-1.5 block text-xs font-semibold text-kbc-navy">Email Address</label>
                            <input
                              type="email"
                              name="email"
                              value={form.email}
                              onChange={(e) => setForm({ ...form, email: e.target.value })}
                              placeholder="your.name@kbc.ac.uk"
                              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-700 focus:border-kbc-navy focus:outline-none"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="mb-1.5 block text-xs font-semibold text-kbc-navy">Your Department</label>
                          <ModernSelect
                            value={form.department}
                            onChange={(value) => setForm({ ...form, department: value })}
                            options={departmentOptions}
                            placeholder="Select department..."
                          />
                        </div>
                      </>
                    )}

                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-kbc-navy">Message *</label>
                      <textarea
                        value={form.message}
                        onChange={(e) => {
                          if (e.target.value.length <= 500) setForm({ ...form, message: e.target.value });
                        }}
                        placeholder="Please describe your feedback, suggestion, or concern in detail..."
                        rows={5}
                        className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-700 focus:border-kbc-navy focus:outline-none"
                        required
                      />
                      <p className={`mt-1 text-right text-xs ${form.message.length >= 450 ? 'text-kbc-red' : 'text-gray-400'}`}>
                        {form.message.length}/500
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 border-t border-gray-100 bg-gray-50/50 px-6 py-4 shrink-0">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg px-4 py-2.5 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-100 hover:text-kbc-navy whitespace-nowrap"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!form.message.trim()}
                    className="rounded-lg bg-kbc-navy px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-kbc-navy-light disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap"
                  >
                    Submit Feedback
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </ModalPortal>
  );
}
