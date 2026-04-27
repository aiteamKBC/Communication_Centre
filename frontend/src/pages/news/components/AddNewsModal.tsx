import { useEffect, useRef, useState } from 'react';
import ModernDatePicker from '../../../components/feature/ModernDatePicker';
import ModernSelect from '../../../components/feature/ModernSelect';
import { kbcSuccessSwal, kbcSwal } from '../../../components/feature/sweetAlert';
import type { NewsItem } from '../../../mocks/news';
import type { NewNewsPayload } from '../useNews';

interface AddNewsModalProps {
  onClose: () => void;
  onSubmitArticle: (payload: NewNewsPayload) => Promise<void>;
  initialArticle?: NewsItem | null;
  departmentOptions: Array<{ label: string; value: string }>;
}

type DraftArticle = {
  title: string;
  date: string;
  category: string;
  summary: string;
  content: string;
  priority: string;
};

const priorityOptions = [
  { label: 'General', value: 'general' },
  { label: 'Important', value: 'important' },
  { label: 'Critical', value: 'critical' },
];

const emptyArticle: DraftArticle = {
  title: '',
  date: '',
  category: '',
  summary: '',
  content: '',
  priority: 'general',
};

function toDraftArticle(article: NewsItem): DraftArticle {
  return {
    title: article.title,
    date: article.publicationDate || '',
    category: article.category || article.department || '',
    summary: article.excerpt || '',
    content: article.content || '',
    priority: article.priority || 'general',
  };
}

export default function AddNewsModal({ onClose, onSubmitArticle, initialArticle, departmentOptions }: AddNewsModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const isEditMode = Boolean(initialArticle);
  const [newArticle, setNewArticle] = useState<DraftArticle>(
    initialArticle ? toDraftArticle(initialArticle) : { ...emptyArticle },
  );

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  useEffect(() => {
    setNewArticle(initialArticle ? toDraftArticle(initialArticle) : { ...emptyArticle });
  }, [initialArticle]);

  const handleSubmit = async () => {
    if (!newArticle.title || !newArticle.summary) {
      await kbcSwal.fire({
        title: 'Complete Required Fields',
        html: 'Fill in the <strong>Article Title</strong> and <strong>Summary / Excerpt</strong> before submitting for review.',
        icon: 'warning',
        confirmButtonText: 'OK',
      });
      return;
    }

    try {
      setSubmitting(true);
      await onSubmitArticle({
        title: newArticle.title,
        date: newArticle.date,
        category: newArticle.category,
        summary: newArticle.summary,
        content: newArticle.content,
        priority: newArticle.priority as NewNewsPayload['priority'],
      });

      setNewArticle({ ...emptyArticle });
      onClose();
      await kbcSuccessSwal.fire({
        title: isEditMode ? 'Article Updated' : 'Article Submitted',
        html: isEditMode
          ? 'The news article was updated successfully.'
          : 'The news article was submitted for review and will be published after approval.',
        icon: 'success',
        confirmButtonText: 'OK',
      });
    } catch {
      await kbcSwal.fire({
        title: isEditMode ? 'Update Failed' : 'Submission Failed',
        html: isEditMode
          ? 'The news article could not be updated. Please try again.'
          : 'The news article could not be submitted for review. Please try again.',
        icon: 'error',
        confirmButtonText: 'OK',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="modal-backdrop" />

      {/* Modal */}
      <div
        ref={modalRef}
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-fade-in"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 flex items-center justify-center bg-kbc-navy rounded-lg">
              <i className="ri-newspaper-line text-white text-sm" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-kbc-navy">{isEditMode ? 'Edit News Article' : 'Add News Article'}</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {isEditMode ? 'Update this announcement before republishing changes' : 'Publish a new announcement to KBC staff'}
              </p>
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
                placeholder="Choose publication date..."
                boundaryRef={modalRef}
                buttonClassName="min-h-[44px] rounded-2xl border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8faff_100%)] px-4 py-2.5 text-sm shadow-[0_12px_26px_-18px_rgba(27,42,74,0.35)]"
              />
            </div>

            {/* Department */}
            <div>
              <label className="block text-xs font-semibold text-kbc-navy mb-1.5">Department</label>
              <ModernSelect
                value={newArticle.category}
                onChange={value => setNewArticle({ ...newArticle, category: value })}
                options={departmentOptions}
                placeholder="Select department..."
                boundaryRef={modalRef}
                menuMinWidth={250}
                buttonClassName="min-h-[44px] rounded-2xl border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8faff_100%)] px-4 py-2.5 text-sm shadow-[0_12px_26px_-18px_rgba(27,42,74,0.35)]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-kbc-navy mb-1.5">Priority</label>
              <ModernSelect
                value={newArticle.priority}
                onChange={value => setNewArticle({ ...newArticle, priority: value })}
                options={priorityOptions}
                boundaryRef={modalRef}
                menuMinWidth={220}
                buttonClassName="min-h-[44px] rounded-2xl border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8faff_100%)] px-4 py-2.5 text-sm shadow-[0_12px_26px_-18px_rgba(27,42,74,0.35)]"
              />
            </div>

            {/* Summary */}
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
          <div className="flex items-center">
            <button
              onClick={() => setNewArticle({ ...emptyArticle })}
              className="text-xs text-gray-500 font-medium hover:text-kbc-navy cursor-pointer whitespace-nowrap transition-colors"
            >
              Clear Form
            </button>
          </div>
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
                <><i className="ri-loader-4-line animate-spin text-sm" /> {isEditMode ? 'Saving...' : 'Submitting...'}</>
              ) : (
                <><i className={`text-sm ${isEditMode ? 'ri-save-line' : 'ri-send-plane-line'}`} /> {isEditMode ? 'Save Changes' : 'Submit for Review'}</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
