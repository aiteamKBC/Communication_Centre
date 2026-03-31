import { useEffect, useRef, useState } from 'react';
import { CalendarEvent, type EventMedia } from '../../../mocks/events';
import ModalPortal from '../../../components/feature/ModalPortal';
import ModernDatePicker from '../../../components/feature/ModernDatePicker';

interface Props {
  open: boolean;
  onClose: () => void;
  onEventAdded: (event: CalendarEvent) => void;
  eventToEdit?: CalendarEvent | null;
}

const EVENT_TYPES = [
  { value: 'online', label: 'Online', icon: 'ri-wifi-line' },
  { value: 'offline', label: 'Offline', icon: 'ri-building-4-line' },
];

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_UPPER = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

const emptyForm = {
  title: '',
  date: '',
  time: '',
  location: '',
  type: 'online',
  description: '',
  registrationLink: '',
};

type LocalMedia = EventMedia & {
  file?: File;
  isExisting?: boolean;
};

function toFormDate(date: string) {
  const [dayText, monthText, yearText] = date.split(' ');
  const monthIdx = MONTH_ABBR.indexOf(monthText);
  const day = String(parseInt(dayText, 10)).padStart(2, '0');
  const month = String(monthIdx + 1).padStart(2, '0');
  return `${yearText}-${month}-${day}`;
}

export default function AddEventModal({ open, onClose, onEventAdded, eventToEdit }: Props) {
  const [form, setForm] = useState(emptyForm);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<{ title?: string; date?: string }>({});
  const [uploads, setUploads] = useState<LocalMedia[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const uploadsRef = useRef<LocalMedia[]>([]);

  useEffect(() => {
    uploadsRef.current = uploads;
  }, [uploads]);

  useEffect(() => {
    return () => {
      uploadsRef.current.forEach(item => URL.revokeObjectURL(item.url));
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;

    if (eventToEdit) {
      const existingMedia = eventToEdit.media?.map(item => ({
        ...item,
        isExisting: true,
      })) ?? (eventToEdit.image ? [{
        id: `${eventToEdit.id}-image`,
        name: `${eventToEdit.title} image`,
        url: eventToEdit.image,
        kind: 'image' as const,
        isExisting: true,
      }] : []);

      setForm({
        title: eventToEdit.title,
        date: toFormDate(eventToEdit.date),
        time: eventToEdit.time ?? '',
        location: eventToEdit.location ?? '',
        type: eventToEdit.type,
        description: eventToEdit.description ?? '',
        registrationLink: eventToEdit.registrationLink ?? '',
      });
      uploadsRef.current = existingMedia;
      setUploads(existingMedia);
      setErrors({});
      setSubmitted(false);
      setIsDragOver(false);
      return;
    }

    setForm(emptyForm);
    setErrors({});
    setSubmitted(false);
    resetUploads();
  }, [open, eventToEdit]);

  if (!open) return null;

  const isSubmitDisabled = !form.title.trim() || !form.date;

  const validate = () => {
    const errs: { title?: string; date?: string } = {};
    if (!form.title.trim()) errs.title = 'Event title is required.';
    if (!form.date) errs.date = 'Date is required.';
    return errs;
  };

  const releaseUploads = (items: LocalMedia[]) => {
    items.forEach(item => {
      if (!item.isExisting && item.url.startsWith('blob:')) {
        URL.revokeObjectURL(item.url);
      }
    });
  };

  const addFiles = (files: FileList | File[]) => {
    const nextFiles = Array.from(files).filter(file => file.type.startsWith('image/') || file.type.startsWith('video/'));
    if (nextFiles.length === 0) {
      return;
    }

    setUploads(current => [
      ...current,
      ...nextFiles.map<LocalMedia>(file => ({
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        url: URL.createObjectURL(file),
        kind: file.type.startsWith('video/') ? 'video' : 'image',
        file,
      })),
    ]);
  };

  const removeUpload = (id: string) => {
    setUploads(current => {
      const target = current.find(item => item.id === id);
      if (target && !target.isExisting && target.url.startsWith('blob:')) {
        URL.revokeObjectURL(target.url);
      }
      return current.filter(item => item.id !== id);
    });
  };

  const resetUploads = (shouldRelease = true) => {
    if (shouldRelease) {
      releaseUploads(uploadsRef.current);
    }
    uploadsRef.current = [];
    setUploads([]);
    setIsDragOver(false);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  const buildEvent = (): CalendarEvent => {
    const dateObj = new Date(form.date + 'T00:00:00');
    const dayNum = dateObj.getDate();
    const monthIdx = dateObj.getMonth();
    const yearNum = dateObj.getFullYear();
    const media = uploads.map(({ file: _file, ...mediaItem }) => mediaItem);
    const firstImage = media.find(item => item.kind === 'image');
    return {
      id: eventToEdit?.id ?? `evt-${Date.now()}`,
      title: form.title.trim(),
      date: `${dayNum} ${MONTH_ABBR[monthIdx]} ${yearNum}`,
      day: String(dayNum),
      month: MONTH_UPPER[monthIdx],
      department: eventToEdit?.department ?? '',
      type: form.type as CalendarEvent['type'],
      time: form.time.trim() || undefined,
      location: form.location.trim() || undefined,
      organiser: eventToEdit?.organiser,
      description: form.description.trim() || undefined,
      registrationLink: form.registrationLink.trim() || undefined,
      image: firstImage?.url,
      media: media.length > 0 ? media : undefined,
    };
  };

  const handleSubmit = () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setErrors({});
    const newEvent = buildEvent();
    onEventAdded(newEvent);
    setSubmitted(true);
    setForm(emptyForm);
    resetUploads(false);
    setTimeout(() => {
      setSubmitted(false);
      onClose();
    }, 2200);
  };

  const handleClose = () => {
    setForm(emptyForm);
    setErrors({});
    setSubmitted(false);
    resetUploads();
    onClose();
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="modal-backdrop absolute inset-0 bg-slate-950/35 backdrop-blur-[7px]" />

        <div
          data-modal-surface
          className="modal-surface relative bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto shadow-2xl"
          onClick={e => e.stopPropagation()}
        >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-kbc-amber rounded-lg flex items-center justify-center shrink-0">
              <i className="ri-add-circle-line text-kbc-navy text-base" />
            </div>
            <div>
              <h2 className="text-base font-bold text-kbc-navy">{eventToEdit ? 'Edit Event' : 'Add New Event'}</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {eventToEdit ? 'Update the event details and save your changes' : 'Fill in the details to add an event to the calendar'}
              </p>
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
                <p className="text-xs font-bold text-green-700">{eventToEdit ? 'Event updated successfully!' : 'Event added to the calendar!'}</p>
                <p className="text-xs text-green-600 mt-0.5">
                  {eventToEdit ? 'Your event details have been refreshed across the calendar and cards.' : 'Navigate to the event&apos;s month to see it on the calendar.'}
                </p>
              </div>
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

            {/* Event Type */}
            <div>
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
                onChange={value => setForm({ ...form, date: value })}
                buttonClassName={errors.date ? 'border-red-400 hover:border-red-400 ring-0' : ''}
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
              <label className="block text-xs font-semibold text-kbc-navy mb-1.5">Location / Platform</label>
              <input
                type="text"
                placeholder={form.type === 'online' ? 'e.g. Microsoft Teams or Zoom' : 'e.g. Training Room 2'}
                value={form.location}
                onChange={e => setForm({ ...form, location: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 placeholder-gray-400 outline-none focus:border-kbc-navy transition-colors"
              />
            </div>

            {/* Registration Link */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-kbc-navy mb-1.5">Registration Link</label>
              <input
                type="url"
                placeholder="https://example.com/register-for-event"
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
                onChange={e => setForm({ ...form, description: e.target.value.slice(0, 500) })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 placeholder-gray-400 outline-none focus:border-kbc-navy transition-colors resize-none"
              />
              <p className="text-xs text-gray-400 mt-1 text-right">{form.description.length}/500</p>
            </div>

            {/* Media Upload */}
            <div className="sm:col-span-2">
              <div className="flex items-center justify-between gap-3 mb-1.5">
                <label className="block text-xs font-semibold text-kbc-navy">Event Media (Optional)</label>
                {uploads.length > 0 && (
                  <button
                    type="button"
                    onClick={() => resetUploads()}
                    className="text-[11px] font-semibold text-gray-400 hover:text-kbc-navy"
                  >
                    Clear files
                  </button>
                )}
              </div>

              <input
                ref={inputRef}
                type="file"
                accept="image/*,video/*"
                multiple
                className="hidden"
                onChange={e => {
                  if (e.target.files) {
                    addFiles(e.target.files);
                  }
                }}
              />

              <div
                role="button"
                tabIndex={0}
                onClick={() => inputRef.current?.click()}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    inputRef.current?.click();
                  }
                }}
                onDragOver={event => {
                  event.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={event => {
                  event.preventDefault();
                  setIsDragOver(false);
                }}
                onDrop={event => {
                  event.preventDefault();
                  setIsDragOver(false);
                  addFiles(event.dataTransfer.files);
                }}
                className={`rounded-2xl border border-dashed px-4 py-6 text-center transition-all cursor-pointer ${
                  isDragOver
                    ? 'border-kbc-navy bg-kbc-navy/5'
                    : 'border-gray-300 bg-gray-50 hover:border-kbc-navy/40 hover:bg-gray-50/80'
                }`}
              >
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm">
                  <i className="ri-upload-cloud-2-line text-2xl text-kbc-navy" />
                </div>
                <p className="text-sm font-semibold text-kbc-navy">Drag and drop images or videos here</p>
                <p className="mt-1 text-xs text-gray-400">or click to browse files from your device</p>
                <p className="mt-2 text-[11px] text-gray-400">Optional. Images and videos are kept locally in this demo session.</p>
              </div>

              {uploads.length > 0 && (
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {uploads.map(item => (
                    <div key={item.id} className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                      <div className="relative h-28 w-full bg-gray-100">
                        {item.kind === 'image' ? (
                          <img src={item.url} alt={item.name} className="h-full w-full object-cover" />
                        ) : (
                          <video src={item.url} className="h-full w-full object-cover" muted playsInline />
                        )}
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            removeUpload(item.id);
                          }}
                          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-gray-600 shadow-sm hover:bg-white"
                        >
                          <i className="ri-close-line text-sm" />
                        </button>
                        <span className="absolute bottom-2 left-2 rounded-full bg-slate-950/65 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
                          {item.kind}
                        </span>
                      </div>
                      <div className="px-3 py-2">
                        <p className="truncate text-xs font-medium text-kbc-navy">{item.name}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <button
            onClick={handleClose}
            className="text-xs font-semibold text-gray-500 hover:text-kbc-navy cursor-pointer whitespace-nowrap transition-colors px-3 py-2"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitDisabled}
            className={`flex items-center gap-1.5 text-xs font-bold px-5 py-2.5 rounded-lg transition-colors whitespace-nowrap ${
              isSubmitDisabled
                ? 'bg-gray-300 text-white cursor-not-allowed'
                : 'bg-kbc-navy text-white cursor-pointer hover:bg-kbc-navy-light'
            }`}
          >
            <i className={`${eventToEdit ? 'ri-save-line' : 'ri-calendar-check-line'} text-xs`} />
            {eventToEdit ? 'Save Changes' : 'Add to Calendar'}
          </button>
        </div>
        </div>
      </div>
    </ModalPortal>
  );
}
