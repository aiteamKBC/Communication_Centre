import { useState, useEffect } from 'react';
import ModalPortal from '../../../components/feature/ModalPortal';
import ModernSelect, { type ModernSelectOption } from '../../../components/feature/ModernSelect';
import ModernDatePicker from '../../../components/feature/ModernDatePicker';

interface AddNewsModalProps {
  onClose: () => void;
}

const audiences = ['All Staff', 'Leadership', 'Budget Holders', 'New Starters', 'Marketing'];
const categories = ['Compliance', 'Quality', 'Leadership', 'IT', 'Training', 'HR', 'Marketing', 'Finance', 'Estates', 'General'];
const categoryOptions: ModernSelectOption[] = categories.map(item => ({ label: item, value: item }));
const audienceOptions: ModernSelectOption[] = audiences.map(item => ({ label: item, value: item }));
const priorityOptions: ModernSelectOption[] = [
  { label: 'General', value: 'general' },
  { label: 'Important', value: 'important' },
  { label: 'Critical', value: 'critical' },
];

export default function AddNewsModal({ onClose }: AddNewsModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [submitDone, setSubmitDone] = useState(false);
  const [newArticle, setNewArticle] = useState({
    title: '',
    date: '',
    category: '',
    summary: '',
    content: '',
    imageUrl: '',
    audience: 'All Staff',
    priority: 'general',
  });

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const handleSubmit = () => {
    if (!newArticle.title || !newArticle.summary) return;
    setSubmitting(true);
    setTimeout(() => {
      setSubmitting(false);
      setSubmitDone(true);
      setNewArticle({ title: '', date: '', category: '', summary: '', content: '', imageUrl: '', audience: 'All Staff', priority: 'general' });
      setTimeout(() => {
        setSubmitDone(false);
        onClose();
      }, 2500);
    }, 800);
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <div
          className="modal-backdrop absolute inset-0 bg-slate-950/35 backdrop-blur-[7px]"
          onClick={onClose}
        />

        {/* Modal */}
        <div
          data-modal-surface
          className="modal-surface relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
        >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 flex items-center justify-center bg-kbc-navy rounded-lg">
              <i className="ri-newspaper-line text-white text-sm" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-kbc-navy">Add News Article</h2>
              <p className="text-xs text-gray-400 mt-0.5">Publish a new announcement to KBC staff</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-kbc-navy hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <i className="ri-close-line text-lg" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {submitDone && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-3 mb-5">
              <i className="ri-checkbox-circle-line text-kbc-green text-base" />
              <span className="text-xs text-kbc-green font-semibold">Article submitted for review and will be published after approval.</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Title */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-kbc-navy mb-1.5">
                Article Title <span className="text-kbc-red">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. New Safeguarding Policy — Action Required by All Staff"
                value={newArticle.title}
                onChange={e => setNewArticle({ ...newArticle, title: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 placeholder-gray-400 outline-none focus:border-kbc-navy transition-colors"
              />
            </div>

            {/* Date */}
            <div>
              <label className="block text-xs font-semibold text-kbc-navy mb-1.5">Publication Date</label>
              <ModernDatePicker
                value={newArticle.date}
                onChange={value => setNewArticle({ ...newArticle, date: value })}
              />
            </div>

            {/* Audience */}
            <div>
              <label className="block text-xs font-semibold text-kbc-navy mb-1.5">Audience</label>
              <ModernSelect
                value={newArticle.audience}
                onChange={value => setNewArticle({ ...newArticle, audience: value })}
                options={audienceOptions}
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs font-semibold text-kbc-navy mb-1.5">Category</label>
              <ModernSelect
                value={newArticle.category}
                onChange={value => setNewArticle({ ...newArticle, category: value })}
                options={categoryOptions}
                placeholder="Select category..."
              />
            </div>

            {/* Priority */}
            <div>
              <label className="block text-xs font-semibold text-kbc-navy mb-1.5">Priority</label>
              <ModernSelect
                value={newArticle.priority}
                onChange={value => setNewArticle({ ...newArticle, priority: value })}
                options={priorityOptions}
              />
            </div>

            {/* Image URL */}
            <div>
              <label className="block text-xs font-semibold text-kbc-navy mb-1.5">Image URL <span className="text-gray-400 font-normal">(optional)</span></label>
              <input
                type="text"
                placeholder="Paste an image URL for the article header..."
                value={newArticle.imageUrl}
                onChange={e => setNewArticle({ ...newArticle, imageUrl: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 placeholder-gray-400 outline-none focus:border-kbc-navy transition-colors"
              />
            </div>

            {/* Image URL */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-kbc-navy mb-1.5">
                Summary / Excerpt <span className="text-kbc-red">*</span>
              </label>
              <textarea
                placeholder="Write a short 2–3 sentence summary that will appear on the news feed..."
                rows={3}
                value={newArticle.summary}
                onChange={e => setNewArticle({ ...newArticle, summary: e.target.value.slice(0, 500) })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 placeholder-gray-400 outline-none focus:border-kbc-navy transition-colors resize-none"
              />
              <p className="text-xs text-gray-400 mt-1 text-right">{newArticle.summary.length}/500</p>
            </div>

            {/* Full Content */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-kbc-navy mb-1.5">Full Article Content</label>
              <textarea
                placeholder="Write the full article content here. Include context, next steps, contact information, and links..."
                rows={5}
                value={newArticle.content}
                onChange={e => setNewArticle({ ...newArticle, content: e.target.value.slice(0, 500) })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 placeholder-gray-400 outline-none focus:border-kbc-navy transition-colors resize-none"
              />
              <p className="text-xs text-gray-400 mt-1 text-right">{newArticle.content.length}/500</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/50 shrink-0">
          <button
            onClick={() => setNewArticle({ title: '', date: '', category: '', summary: '', content: '', imageUrl: '', audience: 'All Staff', priority: 'general' })}
            className="text-xs text-gray-500 font-medium hover:text-kbc-navy cursor-pointer whitespace-nowrap transition-colors"
          >
            Clear Form
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-lg text-xs font-semibold text-gray-600 hover:text-kbc-navy hover:bg-gray-100 transition-colors cursor-pointer whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!newArticle.title || !newArticle.summary || submitting}
              className="flex items-center gap-2 bg-kbc-navy text-white text-xs font-bold px-5 py-2.5 rounded-lg cursor-pointer hover:bg-kbc-navy-light transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <><i className="ri-loader-4-line animate-spin text-sm" /> Submitting...</>
              ) : (
                <><i className="ri-send-plane-line text-sm" /> Submit for Review</>
              )}
            </button>
          </div>
        </div>
        </div>
      </div>
    </ModalPortal>
  );
}
