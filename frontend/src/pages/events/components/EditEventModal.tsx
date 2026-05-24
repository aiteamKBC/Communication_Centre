import { useEffect, useRef, useState } from 'react';
import { CalendarEvent, EventMedia } from '../../../mocks/events';
import ModernDatePicker from '../../../components/feature/ModernDatePicker';

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
  const [cover, setCover]               = useState<EventMedia | null>(null);
  const [gallery, setGallery]           = useState<EventMedia[]>([]);

  const [errors, setErrors]   = useState<{ title?: string; date?: string }>({});
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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
    setCover(existingCover);
    setGallery(event.media?.filter(m => !m.isCover) ?? []);
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

  const readFile = (file: File): Promise<EventMedia> =>
    new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = ev => resolve({
        id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
        kind: file.type.startsWith('video/') ? 'video' : 'image',
        url: ev.target?.result as string,
        name: file.name,
      });
      reader.readAsDataURL(file);
    });

  const handleCoverChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCover(await readFile(file));
    if (coverInputRef.current) coverInputRef.current.value = '';
  };

  const handleGalleryChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const next = await Promise.all(files.map(readFile));
    setGallery(prev => [...prev, ...next]);
    if (galleryInputRef.current) galleryInputRef.current.value = '';
  };

  const buildUpdated = (): CalendarEvent => {
    const dateObj  = new Date(date + 'T00:00:00');
    const dayNum   = dateObj.getDate();
    const monthIdx = dateObj.getMonth();
    const yearNum  = dateObj.getFullYear();
    const allMedia: EventMedia[] = [];
    if (cover) allMedia.push({ ...cover, isCover: true });
    allMedia.push(...gallery);
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
      description: description.trim() || undefined,
      media: allMedia.length ? allMedia : undefined,
      image: cover?.url,
    };
  };

  const handleSubmit = async () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setErrors({});
    setSaveError(null);
    try {
      setSaving(true);
      await onEventUpdated(buildUpdated());
      setSaved(true);
      setTimeout(() => { setSaved(false); onClose(); }, 1800);
    } catch {
      setSaveError('Could not update event. Please try again.');
    } finally {
      setSaving(false);
    }
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
            onClick={onClose}
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
              {cover ? (
                <div className="relative w-full h-40 rounded-xl overflow-hidden border border-gray-200">
                  <img src={cover.url} alt={cover.name} className="w-full h-full object-cover object-top" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                  <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-white truncate">{cover.name}</span>
                    <div className="flex items-center gap-1.5">
                      <button type="button" onClick={() => coverInputRef.current?.click()} className="text-[11px] font-semibold text-kbc-navy bg-white/90 hover:bg-white px-2.5 py-1 rounded-full transition-colors whitespace-nowrap">Change</button>
                      <button type="button" onClick={() => setCover(null)} className="w-6 h-6 flex items-center justify-center rounded-full bg-white/90 hover:bg-white text-kbc-navy transition-colors">
                        <i className="ri-close-line text-xs" />
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="w-full h-28 rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-1.5 cursor-pointer hover:border-kbc-navy hover:bg-gray-50 transition-all" onClick={() => coverInputRef.current?.click()}>
                  <div className="w-9 h-9 flex items-center justify-center bg-gray-100 rounded-full">
                    <i className="ri-image-add-line text-gray-400 text-lg" />
                  </div>
                  <p className="text-xs font-semibold text-gray-500">Click to upload a cover image</p>
                  <p className="text-xs text-gray-400">PNG, JPG recommended</p>
                </div>
              )}
              <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={handleCoverChange} />
            </div>

            {/* Additional Media */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-kbc-navy mb-1.5">
                Additional Media <span className="text-gray-400 font-normal">(optional) — shown in event details</span>
              </label>
              <div
                className="w-full min-h-28 rounded-xl border-2 border-dashed border-gray-200 p-4 flex flex-col gap-3 cursor-pointer hover:border-kbc-navy hover:bg-gray-50 transition-all"
                onClick={() => galleryInputRef.current?.click()}
              >
                {gallery.length > 0 ? (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold text-kbc-navy">{gallery.length} file{gallery.length > 1 ? 's' : ''}</p>
                        <p className="text-xs text-gray-400">Click anywhere to add more.</p>
                      </div>
                      <span className="text-[11px] font-semibold text-kbc-navy bg-white border border-gray-200 px-2.5 py-1 rounded-full whitespace-nowrap">Add More</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {gallery.map(item => (
                        <div key={item.id} className="relative h-28 rounded-xl overflow-hidden border border-gray-200 bg-white" onClick={e => e.stopPropagation()}>
                          {item.kind === 'video'
                            ? <video src={item.url} className="w-full h-full object-cover" muted playsInline />
                            : <img src={item.url} alt={item.name} className="w-full h-full object-cover object-top" />
                          }
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-semibold text-white truncate">{item.kind === 'video' ? 'Video' : 'Image'}</span>
                              <button type="button" onClick={() => setGallery(prev => prev.filter(g => g.id !== item.id))} className="w-6 h-6 flex items-center justify-center rounded-full bg-white/90 hover:bg-white text-kbc-navy transition-colors">
                                <i className="ri-close-line text-xs" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="h-20 flex flex-col items-center justify-center gap-1.5">
                    <div className="w-9 h-9 flex items-center justify-center bg-gray-100 rounded-full">
                      <i className="ri-gallery-upload-line text-gray-400 text-lg" />
                    </div>
                    <p className="text-xs font-semibold text-gray-500">Click to upload images or videos</p>
                    <p className="text-xs text-gray-400">PNG, JPG, MP4, MOV and more</p>
                  </div>
                )}
              </div>
              <input ref={galleryInputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleGalleryChange} />
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
                onChange={e => setDescription(e.target.value.slice(0, 500))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 placeholder-gray-400 outline-none focus:border-kbc-navy transition-colors resize-none"
              />
              <p className="text-xs text-gray-400 mt-1 text-right">{description.length}/500</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} className="text-xs font-semibold text-gray-500 hover:text-kbc-navy cursor-pointer whitespace-nowrap transition-colors px-3 py-2">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex items-center gap-1.5 bg-kbc-navy text-white text-xs font-bold px-5 py-2.5 rounded-lg cursor-pointer hover:bg-kbc-navy-light transition-colors whitespace-nowrap"
          >
            <i className="ri-save-line text-xs" />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
