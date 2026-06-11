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
  event: CalendarEvent | null;
  onClose: () => void;
  onEventUpdated: (event: CalendarEvent) => Promise<void>;
}

const EVENT_TYPES = [
  { value: 'online',  label: 'Online',  icon: 'ri-wifi-line' },
  { value: 'offline', label: 'Offline', icon: 'ri-map-pin-line' },
];

const MONTH_ABBR  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_UPPER = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

function toInputDate(dateStr: string): string {
  const parts = dateStr.split(' ');
  if (parts.length !== 3) return '';
  const day   = parts[0].padStart(2, '0');
  const month = (MONTH_ABBR.indexOf(parts[1]) + 1).toString().padStart(2, '0');
  const year  = parts[2];
  return `${year}-${month}-${day}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default function EditEventModal({ event, onClose, onEventUpdated }: Props) {
  const panelRef     = useRef<HTMLDivElement>(null);
  const coverInputRef   = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle]               = useState('');
  const [date, setDate]                 = useState('');
  const [time, setTime]                 = useState('');
  const [location, setLocation]         = useState('');
  const [registrationLink, setRegLink]  = useState('');
  const [type, setType]                 = useState<'online' | 'offline'>('online');
  const [description, setDescription]   = useState('');

  const [errors, setErrors]   = useState<{ title?: string; date?: string }>({});
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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
    if (!event) return;
    setTitle(event.title);
    setDate(toInputDate(event.date));
    setTime(event.time ?? '');
    setLocation(event.location ?? '');
    setRegLink(event.registrationLink ?? '');
    setType(event.type);
    setDescription(event.description ?? '');
    const existingCover = event.media?.find(m => m.isCover) ?? null;
    const existingGallery = event.media?.filter(m => !m.isCover) ?? [];
    coverUploads.setExistingMedia(existingCover ? [existingCover] : []);
    galleryUploads.setExistingMedia(existingGallery);
    setErrors({});
    setSaveError(null);
    setSaved(false);
  }, [event]);

  useEffect(() => {
    if (!event) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [event]);

  if (!event) return null;

  const validate = () => {
    const errs: { title?: string; date?: string } = {};
    if (!title.trim()) errs.title = 'Event title is required.';
    if (!date) errs.date = 'Date is required.';
    return errs;
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

  const handleGalleryChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setSaveError(null);
    const result = galleryUploads.selectFiles(files, { replace: false, batchKind: 'gallery' });
    await showRejectedMessages(result.rejectedMessages);
    if (galleryInputRef.current) galleryInputRef.current.value = '';
  };

  const buildUpdated = (): CalendarEvent => {
    const dateObj  = new Date(date + 'T00:00:00');
    const dayNum   = dateObj.getDate();
    const monthIdx = dateObj.getMonth();
    const yearNum  = dateObj.getFullYear();
    const cover = coverUploads.uploadedMedia[0];
    const allMedia = [
      ...(cover ? [{ ...cover, isCover: true }] : []),
      ...galleryUploads.uploadedMedia,
    ];
    return {
      ...event,
      title: title.trim(),
      date: `${dayNum} ${MONTH_ABBR[monthIdx]} ${yearNum}`,
      day: String(dayNum),
      month: MONTH_UPPER[monthIdx],
      type,
      time: time.trim() || undefined,
      location: location.trim() || undefined,
      registrationLink: registrationLink.trim() || undefined,
      description: description || undefined,
      media: allMedia.length ? allMedia : undefined,
      image: cover?.url,
    };
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
    try {
      setSaving(true);
      await onEventUpdated(buildUpdated());
      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        coverUploads.clear();
        galleryUploads.clear();
        onClose();
      }, 1800);
    } catch {
      setSaveError('Could not update event. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    coverUploads.clear();
    galleryUploads.clear();
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
              <i className="ri-edit-line text-kbc-navy text-base" />
            </div>
            <div>
              <h2 className="text-base font-bold text-kbc-navy">Edit Event</h2>
              <p className="text-xs text-gray-400 mt-0.5">Update the event details</p>
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
          {saved && (
            <div className="flex items-center gap-2.5 bg-green-50 border border-green-200 rounded-xl px-4 py-3.5 mb-5">
              <div className="w-7 h-7 flex items-center justify-center bg-green-100 rounded-full shrink-0">
                <i className="ri-checkbox-circle-line text-green-600 text-base" />
              </div>
              <p className="text-xs font-bold text-green-700">Event updated successfully!</p>
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
                value={title}
                onChange={e => setTitle(e.target.value)}
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
              <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={handleCoverChange} />
            </div>

            {/* Additional Media */}
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
              <input ref={galleryInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleGalleryChange} />
            </div>

            {/* Event Type */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-kbc-navy mb-1.5">Event Type</label>
              <div className="flex flex-wrap gap-2">
                {EVENT_TYPES.map(t => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setType(t.value as 'online' | 'offline')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer whitespace-nowrap transition-all border ${
                      type === t.value ? 'bg-kbc-navy text-white border-kbc-navy' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
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
                value={date}
                onChange={setDate}
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
                value={time}
                onChange={e => setTime(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 placeholder-gray-400 outline-none focus:border-kbc-navy transition-colors"
              />
            </div>

            {/* Location */}
            <div>
              <label className="block text-xs font-semibold text-kbc-navy mb-1.5">
                {type === 'online' ? 'Platform / Meeting Link' : 'Location'}
              </label>
              <input
                type="text"
                placeholder={type === 'online' ? 'e.g. Microsoft Teams or Zoom' : 'e.g. Training Room 2'}
                value={location}
                onChange={e => setLocation(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 placeholder-gray-400 outline-none focus:border-kbc-navy transition-colors"
              />
            </div>

            {/* Registration Link */}
            <div>
              <label className="block text-xs font-semibold text-kbc-navy mb-1.5">Registration Link</label>
              <input
                type="url"
                placeholder="e.g. https://forms.office.com/..."
                value={registrationLink}
                onChange={e => setRegLink(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 placeholder-gray-400 outline-none focus:border-kbc-navy transition-colors"
              />
            </div>

            {/* Description */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-kbc-navy mb-1.5">Description</label>
              <textarea
                placeholder="Provide a brief description..."
                rows={4}
                value={description}
                onChange={e => setDescription(e.target.value)}
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
          <button onClick={handleClose} className="text-xs font-semibold text-gray-500 hover:text-kbc-navy cursor-pointer whitespace-nowrap transition-colors px-3 py-2">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || mediaBlocksSave}
            className={`flex items-center gap-1.5 text-white text-xs font-bold px-5 py-2.5 rounded-lg transition-colors whitespace-nowrap ${
              saving || mediaBlocksSave ? 'bg-kbc-navy/70 cursor-not-allowed' : 'bg-kbc-navy cursor-pointer hover:bg-kbc-navy-light'
            }`}
          >
            <i className="ri-save-line text-xs" />
            {uploadRemaining > 0 ? `Uploading images... ${uploadRemaining} remaining` : saving ? 'Saving...' : 'Save Changes'}
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}
