import { useEffect, useRef, useState } from 'react';
import { CalendarEvent, EventMedia } from '../../../mocks/events';
import ModernDatePicker from '../../../components/feature/ModernDatePicker';

interface Props {
  open: boolean;
  onClose: () => void;
  onEventAdded: (event: CalendarEvent) => void;
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
  media: [] as EventMedia[],
};

export default function AddEventModal({ open, onClose, onEventAdded }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<{ title?: string; date?: string }>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    const coverImage = form.media.find(item => item.kind === 'image')?.url;
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
      description: form.description.trim() || undefined,
      media: form.media.length ? form.media : undefined,
      image: coverImage,
    };
  };

  const handleMediaChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    const nextMedia = await Promise.all(files.map(file => new Promise<EventMedia>((resolve) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        resolve({
          id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
          kind: file.type.startsWith('video/') ? 'video' : 'image',
          url: ev.target?.result as string,
          name: file.name,
        });
      };
      reader.readAsDataURL(file);
    })));

    setForm(prev => ({ ...prev, media: [...prev.media, ...nextMedia] }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveMedia = (mediaId: string) => {
    setForm(prev => ({ ...prev, media: prev.media.filter(item => item.id !== mediaId) }));
  };

  const handleSubmit = () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setErrors({});
    const newEvent = buildEvent();
    onEventAdded(newEvent);
    setSubmitted(true);
    setForm(emptyForm);
    setTimeout(() => {
      setSubmitted(false);
      onClose();
    }, 2200);
  };

  const handleClose = () => {
    setForm(emptyForm);
    setErrors({});
    setSubmitted(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
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

            {/* Event Media Upload */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-kbc-navy mb-1.5">Event Media <span className="text-gray-400 font-normal">(optional)</span></label>
              <div
                className="w-full min-h-32 rounded-xl border-2 border-dashed border-gray-200 p-4 flex flex-col gap-3 cursor-pointer hover:border-kbc-navy hover:bg-gray-50 transition-all"
                onClick={() => fileInputRef.current?.click()}
              >
                {form.media.length > 0 ? (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold text-kbc-navy">{form.media.length} file{form.media.length > 1 ? 's' : ''} selected</p>
                        <p className="text-xs text-gray-400">Images and videos are supported. Click anywhere to add more.</p>
                      </div>
                      <span className="text-[11px] font-semibold text-kbc-navy bg-white border border-gray-200 px-2.5 py-1 rounded-full whitespace-nowrap">
                        Add More
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {form.media.map(item => (
                        <div
                          key={item.id}
                          className="relative h-28 rounded-xl overflow-hidden border border-gray-200 bg-white"
                          onClick={e => e.stopPropagation()}
                        >
                          {item.kind === 'video' ? (
                            <video src={item.url} className="w-full h-full object-cover" muted playsInline />
                          ) : (
                            <img src={item.url} alt={item.name} className="w-full h-full object-cover object-top" />
                          )}
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-semibold text-white truncate">{item.kind === 'video' ? 'Video' : 'Image'}</span>
                              <button
                                type="button"
                                onClick={() => handleRemoveMedia(item.id)}
                                className="w-6 h-6 flex items-center justify-center rounded-full bg-white/90 hover:bg-white text-kbc-navy transition-colors"
                              >
                                <i className="ri-close-line text-xs" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="h-24 flex flex-col items-center justify-center gap-1.5">
                    <div className="w-9 h-9 flex items-center justify-center bg-gray-100 rounded-full">
                      <i className="ri-gallery-upload-line text-gray-400 text-lg" />
                    </div>
                    <p className="text-xs font-semibold text-gray-500">Click to upload images or videos</p>
                    <p className="text-xs text-gray-400">PNG, JPG, MP4, MOV and more</p>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
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
                onChange={e => setForm({ ...form, description: e.target.value.slice(0, 500) })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 placeholder-gray-400 outline-none focus:border-kbc-navy transition-colors resize-none"
              />
              <p className="text-xs text-gray-400 mt-1 text-right">{form.description.length}/500</p>
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
            className="flex items-center gap-1.5 bg-kbc-navy text-white text-xs font-bold px-5 py-2.5 rounded-lg cursor-pointer hover:bg-kbc-navy-light transition-colors whitespace-nowrap"
          >
            <i className="ri-calendar-check-line text-xs" />
            Add to Calendar
          </button>
        </div>
      </div>
    </div>
  );
}
