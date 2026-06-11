import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarEvent } from '../../../mocks/events';
import ModernDatePicker from '../../../components/feature/ModernDatePicker';
import { kbcSuccessSwal, kbcSwal } from '../../../components/feature/sweetAlert';
import EventMediaUploadPreview from './EventMediaUploadPreview';
import {
  EVENT_GALLERY_UPLOAD_CONCURRENCY,
  MAX_EVENT_IMAGE_SIZE_MB,
  useEventMediaUploads,
  type EventMediaBatchKind,
} from './eventMediaUpload';

interface Props {
  open: boolean;
  onClose: () => void;
  onEventAdded: (event: CalendarEvent) => Promise<void>;
}

const EVENT_TYPES = [
  { value: 'online',  label: 'Online',  icon: 'ri-wifi-line' },
  { value: 'offline', label: 'Offline', icon: 'ri-map-pin-line' },
];

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_UPPER = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

const emptyForm = {
  title: '',
  date: '',
  time: '',
  location: '',
  registrationLink: '',
  type: 'online',
  description: '',
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default function AddEventModal({ open, onClose, onEventAdded }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ title?: string; date?: string }>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const handleBatchUploaded = useCallback((batch: { kind: EventMediaBatchKind; total: number }) => {
    const isCover = batch.kind === 'cover';
    void kbcSuccessSwal.fire({
      title: isCover ? 'Cover Image Uploaded' : 'Additional Media Uploaded',
      html: isCover
        ? 'The cover image is ready. You can now save the event.'
        : `${batch.total} image${batch.total === 1 ? '' : 's'} uploaded successfully. You can now save the event.`,
      icon: 'success',
      confirmButtonText: 'OK',
    });
  }, []);

  const coverUploads = useEventMediaUploads({ concurrency: 1, onBatchUploaded: handleBatchUploaded });
  const galleryUploads = useEventMediaUploads({ concurrency: EVENT_GALLERY_UPLOAD_CONCURRENCY, onBatchUploaded: handleBatchUploaded });

  const uploadRemaining = coverUploads.queuedOrUploadingCount + galleryUploads.queuedOrUploadingCount;
  const failedUploads = coverUploads.failedCount + galleryUploads.failedCount;
  const unsafeUploads = coverUploads.unsafeCount + galleryUploads.unsafeCount;
  const mediaBlocksSave = coverUploads.blocksSave || galleryUploads.blocksSave;

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  const validate = () => {
    const errs: { title?: string; date?: string } = {};
    if (!form.title.trim()) errs.title = 'Event title is required.';
    if (!form.date) errs.date = 'Date is required.';
    return errs;
  };

  const buildEvent = (): CalendarEvent => {
    const dateObj = new Date(form.date + 'T00:00:00');
    const dayNum = dateObj.getDate();
    const monthIdx = dateObj.getMonth();
    const yearNum = dateObj.getFullYear();
    const cover = coverUploads.uploadedMedia[0];
    const allMedia = [
      ...(cover ? [{ ...cover, isCover: true }] : []),
      ...galleryUploads.uploadedMedia,
    ];
    return {
      id: `evt-${Date.now()}`,
      title: form.title.trim(),
      date: `${dayNum} ${MONTH_ABBR[monthIdx]} ${yearNum}`,
      day: String(dayNum),
      month: MONTH_UPPER[monthIdx],
      type: form.type as CalendarEvent['type'],
      time: form.time.trim() || undefined,
      location: form.location.trim() || undefined,
      registrationLink: form.registrationLink.trim() || undefined,
      description: form.description || undefined,
      media: allMedia.length ? allMedia : undefined,
      image: cover?.url,
    };
  };

  const showRejectedMessages = async (messages: string[]) => {
    if (messages.length === 0) return;
    await kbcSwal.fire({
      title: messages.length === 1 ? 'Image Not Uploaded' : 'Some Images Were Not Uploaded',
      html: messages.length === 1
        ? escapeHtml(messages[0])
        : `The following images were not uploaded:<br><br>${messages.map(message => `&bull; ${escapeHtml(message)}`).join('<br>')}`,
      icon: 'warning',
      confirmButtonText: 'OK',
    });
  };

  const handleCoverChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaveError(null);
    const result = coverUploads.selectFiles([file], { replace: true, batchKind: 'cover' });
    await showRejectedMessages(result.rejectedMessages);
    if (coverInputRef.current) coverInputRef.current.value = '';
  };

  const handleMediaChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setSaveError(null);
    const result = galleryUploads.selectFiles(files, { replace: false, batchKind: 'gallery' });
    await showRejectedMessages(result.rejectedMessages);
    if (galleryInputRef.current) galleryInputRef.current.value = '';
  };

  const handleSubmit = async () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setErrors({});
    setSaveError(null);
    if (mediaBlocksSave) {
      if (uploadRemaining > 0) setSaveError(`Uploading images... ${uploadRemaining} remaining.`);
      else if (failedUploads > 0) setSaveError('Remove or retry failed image uploads before saving.');
      else if (unsafeUploads > 0) setSaveError('Unsafe image payload detected. Remove or retry affected images before saving.');
      return;
    }
    const newEvent = buildEvent();

    try {
      setSaving(true);
      await onEventAdded(newEvent);
      setSubmitted(true);
      setForm(emptyForm);
      setTimeout(() => {
        setSubmitted(false);
        coverUploads.clear();
        galleryUploads.clear();
        onClose();
      }, 2200);
    } catch {
      setSaveError('Could not save event to the database. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setForm(emptyForm);
    setErrors({});
    setSaveError(null);
    setSubmitted(false);
    setSaving(false);
    coverUploads.clear();
    galleryUploads.clear();
    if (coverInputRef.current) coverInputRef.current.value = '';
    if (galleryInputRef.current) galleryInputRef.current.value = '';
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="modal-backdrop" />

      <div
        ref={panelRef}
        className="relative bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-kbc-amber rounded-lg flex items-center justify-center shrink-0">
              <i className="ri-add-circle-line text-kbc-navy text-base" />
            </div>
            <div>
              <h2 className="text-base font-bold text-kbc-navy">Add New Event</h2>
              <p className="text-xs text-gray-400 mt-0.5">Fill in the details to add an event to the calendar</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-full cursor-pointer transition-colors"
          >
            <i className="ri-close-line text-kbc-navy text-base" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {submitted && (
            <div className="flex items-center gap-2.5 bg-green-50 border border-green-200 rounded-xl px-4 py-3.5 mb-5">
              <div className="w-7 h-7 flex items-center justify-center bg-green-100 rounded-full shrink-0">
                <i className="ri-checkbox-circle-line text-green-600 text-base" />
              </div>
              <div>
                <p className="text-xs font-bold text-green-700">Event added to the calendar!</p>
                <p className="text-xs text-green-600 mt-0.5">Navigate to the event&apos;s month to see it on the calendar.</p>
              </div>
            </div>
          )}

          {saveError && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-5">
              <p className="text-xs font-semibold text-red-700">{saveError}</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Title */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-kbc-navy mb-1.5">
                Event Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Cohort A Assessment Preparation Workshop"
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                className={`w-full border rounded-lg px-3 py-2.5 text-sm text-gray-700 placeholder-gray-400 outline-none transition-colors ${errors.title ? 'border-red-400' : 'border-gray-200 focus:border-kbc-navy'}`}
              />
              {errors.title && <p className="text-xs text-red-500 mt-1">{errors.title}</p>}
            </div>

            {/* Cover Image */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-kbc-navy mb-1.5">
                Cover Image <span className="text-gray-400 font-normal">(optional) — shown on the event card</span>
              </label>
              <EventMediaUploadPreview
                items={coverUploads.items}
                emptyTitle="Click to upload a cover image"
                emptyHint={`Images only, max ${MAX_EVENT_IMAGE_SIZE_MB}MB`}
                onPick={() => coverInputRef.current?.click()}
                onRemove={coverUploads.remove}
                onRetry={coverUploads.retry}
                cover
              />
              <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleCoverChange}
              />
            </div>

            {/* Additional Media (gallery in event details) */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-kbc-navy mb-1.5">
                Additional Media <span className="text-gray-400 font-normal">(optional) — shown in event details</span>
              </label>
              <EventMediaUploadPreview
                items={galleryUploads.items}
                emptyTitle="Click to upload images"
                emptyHint={`Images only, max ${MAX_EVENT_IMAGE_SIZE_MB}MB each`}
                onPick={() => galleryInputRef.current?.click()}
                onRemove={galleryUploads.remove}
                onRetry={galleryUploads.retry}
              />
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleMediaChange}
              />
            </div>

            {/* Event Type */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-kbc-navy mb-1.5">Event Type</label>
              <div className="flex flex-wrap gap-2">
                {EVENT_TYPES.map(t => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setForm({ ...form, type: t.value })}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer whitespace-nowrap transition-all border ${
                      form.type === t.value
                        ? 'bg-kbc-navy text-white border-kbc-navy'
                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <i className={`${t.icon} text-xs`} />
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Date */}
            <div>
              <label className="block text-xs font-semibold text-kbc-navy mb-1.5">
                Date <span className="text-red-500">*</span>
              </label>
              <ModernDatePicker
                value={form.date}
                onChange={(value) => setForm({ ...form, date: value })}
                placeholder="mm/dd/yyyy"
                className="w-full"
                boundaryRef={panelRef}
                buttonClassName={errors.date ? 'border-red-400 ring-0 focus:border-red-400' : 'border-gray-200'}
              />
              {errors.date && <p className="text-xs text-red-500 mt-1">{errors.date}</p>}
            </div>

            {/* Time */}
            <div>
              <label className="block text-xs font-semibold text-kbc-navy mb-1.5">Time</label>
              <input
                type="text"
                placeholder="e.g. 10:00 – 13:00"
                value={form.time}
                onChange={e => setForm({ ...form, time: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 placeholder-gray-400 outline-none focus:border-kbc-navy transition-colors"
              />
            </div>

            {/* Location */}
            <div>
              <label className="block text-xs font-semibold text-kbc-navy mb-1.5">
                {form.type === 'online' ? 'Platform / Meeting Link' : 'Location'}
              </label>
              <input
                type="text"
                placeholder={form.type === 'online' ? 'e.g. Microsoft Teams or Zoom' : 'e.g. Training Room 2'}
                value={form.location}
                onChange={e => setForm({ ...form, location: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 placeholder-gray-400 outline-none focus:border-kbc-navy transition-colors"
              />
            </div>

            {/* Registration Link */}
            <div>
              <label className="block text-xs font-semibold text-kbc-navy mb-1.5">Registration Link</label>
              <input
                type="url"
                placeholder="e.g. https://forms.office.com/..."
                value={form.registrationLink}
                onChange={e => setForm({ ...form, registrationLink: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 placeholder-gray-400 outline-none focus:border-kbc-navy transition-colors"
              />
            </div>

            {/* Description */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-kbc-navy mb-1.5">Description</label>
              <textarea
                placeholder="Provide a brief description of the event, who should attend, and any preparation required..."
                rows={4}
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 placeholder-gray-400 outline-none focus:border-kbc-navy transition-colors resize-none"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <p className="min-h-4 text-xs font-semibold text-gray-500">
            {uploadRemaining > 0
              ? `Uploading images... ${uploadRemaining} remaining`
              : failedUploads > 0
                ? 'Remove or retry failed uploads before saving.'
                : unsafeUploads > 0
                  ? 'Unsafe image data detected. Remove or retry affected images.'
                  : ''}
          </p>
          <div className="flex items-center justify-end gap-3">
          <button
            onClick={handleClose}
            className="text-xs font-semibold text-gray-500 hover:text-kbc-navy cursor-pointer whitespace-nowrap transition-colors px-3 py-2"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || mediaBlocksSave}
            className={`flex items-center gap-1.5 text-white text-xs font-bold px-5 py-2.5 rounded-lg transition-colors whitespace-nowrap ${
              saving || mediaBlocksSave ? 'bg-kbc-navy/70 cursor-not-allowed' : 'bg-kbc-navy cursor-pointer hover:bg-kbc-navy-light'
            }`}
          >
            <i className="ri-calendar-check-line text-xs" />
            {uploadRemaining > 0 ? `Uploading images... ${uploadRemaining} remaining` : saving ? 'Saving...' : 'Add to Calendar'}
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}
