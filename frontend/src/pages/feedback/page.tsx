import { useState } from 'react';
import { Link } from 'react-router-dom';
import TopNav from '../../components/feature/TopNav';
import Footer from '../../components/feature/Footer';
import ModernSelect from '../../components/feature/ModernSelect';

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

export default function FeedbackPage() {
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    category: 'General Feedback',
    department: '',
    priority: 'normal',
    message: '',
    anonymous: false,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.message.trim()) return;
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <TopNav />

      {/* Page Header */}
      <div className="bg-white border-b border-gray-200 px-4 md:px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-2 text-gray-400 text-xs mb-2">
            <Link to="/" className="hover:text-kbc-navy cursor-pointer">Home</Link>
            <span>/</span>
            <span className="text-kbc-navy font-medium">Feedback</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-kbc-navy rounded flex items-center justify-center shrink-0">
              <i className="ri-feedback-line text-white text-base" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-kbc-navy">Staff Feedback &amp; Suggestions</h1>
              <p className="text-gray-400 text-xs mt-0.5">Your feedback helps us improve the platform and the organisation. All submissions are reviewed by the leadership team.</p>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-4 md:px-6 py-10">
        {submitted ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <i className="ri-check-double-line text-3xl text-kbc-green" />
            </div>
            <h2 className="text-xl font-bold text-kbc-navy mb-2">Feedback Received</h2>
            <p className="text-gray-500 text-sm leading-relaxed mb-6 max-w-sm mx-auto">
              Thank you for taking the time to share your feedback. It has been submitted and will be reviewed by the appropriate team within 5 working days.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => { setSubmitted(false); setForm({ name: '', email: '', category: 'General Feedback', department: '', priority: 'normal', message: '', anonymous: false }); }}
                className="border border-gray-200 text-gray-600 font-semibold text-sm px-5 py-2.5 rounded cursor-pointer hover:bg-gray-50 whitespace-nowrap"
              >
                Submit Another
              </button>
              <Link to="/" className="bg-kbc-navy text-white font-semibold text-sm px-5 py-2.5 rounded cursor-pointer hover:bg-kbc-navy-light whitespace-nowrap">
                Back to Home
              </Link>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 p-8">
            <h2 className="text-base font-bold text-kbc-navy mb-1">Submit Feedback</h2>
            <p className="text-gray-400 text-xs mb-6">All fields marked with * are required. Anonymous submissions are welcome.</p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              {/* Anonymous Toggle */}
              <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl">
                <input
                  type="checkbox"
                  id="anonymous"
                  checked={form.anonymous}
                  onChange={(e) => setForm({ ...form, anonymous: e.target.checked })}
                  className="w-4 h-4 accent-kbc-navy cursor-pointer"
                />
                <label htmlFor="anonymous" className="text-sm font-medium text-kbc-navy cursor-pointer">
                  Submit anonymously
                </label>
                <span className="text-xs text-gray-400 ml-auto">Your identity will not be recorded</span>
              </div>

              {/* Name & Email */}
              {!form.anonymous && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1.5">Category *</label>
                  <ModernSelect
                    value={form.category}
                    onChange={(value) => setForm({ ...form, category: value })}
                    options={categories.map((category) => ({ value: category, label: category }))}
                    className="w-full"
                    buttonClassName="min-h-[46px] rounded-2xl border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8faff_100%)] px-4 py-2.5 text-sm shadow-[0_12px_26px_-18px_rgba(27,42,74,0.35)]"
                    menuMinWidth={220}
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
                    buttonClassName="min-h-[46px] rounded-2xl border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8faff_100%)] px-4 py-2.5 text-sm shadow-[0_12px_26px_-18px_rgba(27,42,74,0.35)]"
                    menuMinWidth={240}
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
                      className={`px-4 py-2 rounded-full text-xs font-semibold border cursor-pointer whitespace-nowrap transition-all ${form.priority === p.value ? p.color : 'border-gray-200 text-gray-400 bg-white hover:bg-gray-50'}`}
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
                  rows={5}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 resize-none focus:outline-none focus:border-kbc-navy"
                  required
                />
                <p className={`text-xs text-right mt-1 ${form.message.length >= 450 ? 'text-kbc-red' : 'text-gray-400'}`}>
                  {form.message.length}/500 characters
                </p>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={!form.message.trim()}
                className="w-full bg-kbc-navy text-white font-bold text-sm py-3 rounded-lg cursor-pointer hover:bg-kbc-navy-light disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
              >
                Submit Feedback
              </button>
            </form>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
