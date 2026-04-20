import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Footer from '../../components/feature/Footer';
import SafeImage from '../../components/feature/SafeImage';
import TopNav from '../../components/feature/TopNav';
import { kbcSuccessSwal, kbcSwal } from '../../components/feature/sweetAlert';

type LeadershipMessage = {
  id: string;
  cardTitle: string;
  authorName: string;
  authorRole: string;
  isActive: boolean;
  date: string;
  body: string;
  coverImageUrl: string;
  profileImageUrl: string;
};

type LeadershipMessagePayload = {
  cardTitle: string;
  authorName: string;
  authorRole: string;
  publicationDate: string;
  body: string;
  coverImageUrl: string;
  profileImageUrl: string;
};

const emptyForm: LeadershipMessagePayload = {
  cardTitle: '',
  authorName: '',
  authorRole: '',
  publicationDate: new Date().toISOString().slice(0, 10),
  body: '',
  coverImageUrl: '',
  profileImageUrl: '',
};

const weekdayLabels = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function formatInputDate(value: string) {
  if (!value) {
    return 'Select publication date';
  }

  const parsed = new Date(`${value}T00:00:00`);
  return parsed.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function buildMonthDays(monthDate: Date) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const startDate = new Date(year, month, 1 - startOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(startDate);
    day.setDate(startDate.getDate() + index);
    return day;
  });
}

function isSameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate()
  );
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toPayload(message: LeadershipMessage): LeadershipMessagePayload {
  return {
    cardTitle: message.cardTitle,
    authorName: message.authorName,
    authorRole: message.authorRole,
    publicationDate: message.date || new Date().toISOString().slice(0, 10),
    body: message.body,
    coverImageUrl: message.coverImageUrl || '',
    profileImageUrl: message.profileImageUrl || '',
  };
}

export default function LeadershipMessagePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState<LeadershipMessagePayload>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<LeadershipMessage[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingProfile, setUploadingProfile] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const initial = new Date(`${emptyForm.publicationDate}T00:00:00`);
    return new Date(initial.getFullYear(), initial.getMonth(), 1);
  });
  const datePickerRef = useRef<HTMLDivElement | null>(null);

  const canSave = useMemo(
    () => (
      Boolean(form.cardTitle.trim())
      && Boolean(form.authorName.trim())
      && Boolean(form.publicationDate)
      && Boolean(form.body.trim())
      && Boolean(form.coverImageUrl.trim())
      && Boolean(form.profileImageUrl.trim())
    ),
    [form.authorName, form.body, form.cardTitle, form.coverImageUrl, form.profileImageUrl, form.publicationDate],
  );
  const selectedDate = form.publicationDate ? new Date(`${form.publicationDate}T00:00:00`) : null;
  const calendarDays = useMemo(() => buildMonthDays(calendarMonth), [calendarMonth]);

  const applyEditMessage = (message: LeadershipMessage) => {
    setEditingId(message.id);
    setForm(toPayload(message));
    const messageDate = message.date ? new Date(`${message.date}T00:00:00`) : new Date();
    setCalendarMonth(new Date(messageDate.getFullYear(), messageDate.getMonth(), 1));
    setDatePickerOpen(false);
  };

  const loadMessages = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/leadership-message/?list=1');
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const payload = await response.json() as LeadershipMessage[];
      setMessages(Array.isArray(payload) ? payload : []);
    } catch {
      setMessages([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMessages();
  }, []);

  useEffect(() => {
    const editId = searchParams.get('edit');
    if (!editId || messages.length === 0) {
      return;
    }

    const targetMessage = messages.find(message => message.id === editId);
    if (targetMessage) {
      applyEditMessage(targetMessage);
    }
  }, [messages, searchParams]);

  useEffect(() => {
    if (!datePickerOpen) {
      return undefined;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!datePickerRef.current?.contains(event.target as Node)) {
        setDatePickerOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [datePickerOpen]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    const initial = new Date(`${emptyForm.publicationDate}T00:00:00`);
    setCalendarMonth(new Date(initial.getFullYear(), initial.getMonth(), 1));
    setDatePickerOpen(false);
  };

  const handleAddNewMessage = () => {
    resetForm();
    navigate('/leadership-message/new');
  };

  const uploadImageFile = async (file: File, field: 'coverImageUrl' | 'profileImageUrl') => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', 'leadership');

    const setUploading = field === 'coverImageUrl' ? setUploadingCover : setUploadingProfile;

    try {
      setUploading(true);
      const response = await fetch('/api/upload-image/', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = (await response.text()).trim();
        throw new Error(errorText || `Upload failed with status ${response.status}`);
      }

      const payload = await response.json() as { url?: string };
      if (!payload.url) {
        throw new Error('Upload response did not include a file URL.');
      }

      setForm(current => ({ ...current, [field]: payload.url || '' }));
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown upload error';
      await kbcSwal.fire({
        title: 'Image Upload Failed',
        html: `The selected image could not be uploaded.<br /><br /><strong>Details:</strong> ${detail}`,
        icon: 'error',
        confirmButtonText: 'OK',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!canSave || saving) {
      await kbcSwal.fire({
        title: 'Complete Required Fields',
        html: 'Fill in the <strong>Card Title</strong>, <strong>Author Name</strong>, <strong>Publication Date</strong>, <strong>Message Body</strong>, <strong>Cover Image</strong>, and <strong>Profile Image</strong> before saving.',
        icon: 'warning',
        confirmButtonText: 'OK',
      });
      return;
    }

    try {
      setSaving(true);
      const response = await fetch(editingId ? `/api/leadership-message/${editingId}/` : '/api/leadership-message/', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          cardTeaser: 'Click to read the full message',
          isActive: true,
        }),
      });

      if (!response.ok) {
        const errorText = (await response.text()).trim();
        throw new Error(errorText || `Request failed with status ${response.status}`);
      }

      await kbcSuccessSwal.fire({
        title: editingId ? 'CEO Message Updated' : 'CEO Message Saved',
        html: editingId
          ? 'The leadership message was updated successfully.'
          : 'The leadership message was added to the database successfully.',
        icon: 'success',
        confirmButtonText: 'OK',
      });

      resetForm();
      await loadMessages();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown save error';
      await kbcSwal.fire({
        title: editingId ? 'CEO Message Not Updated' : 'CEO Message Not Saved',
        html: `The leadership message could not be saved.<br /><br /><strong>Details:</strong> ${message}`,
        icon: 'error',
        confirmButtonText: 'OK',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (message: LeadershipMessage) => {
    const result = await kbcSwal.fire({
      title: 'Delete CEO Message?',
      html: `The message <strong>${message.cardTitle}</strong> will be removed from the database.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      cancelButtonText: 'Cancel',
      reverseButtons: true,
      focusCancel: true,
    });

    if (!result.isConfirmed) {
      return;
    }

    try {
      const response = await fetch(`/api/leadership-message/${message.id}/`, { method: 'DELETE' });
      if (!response.ok) {
        const errorText = (await response.text()).trim();
        throw new Error(errorText || `Request failed with status ${response.status}`);
      }

      if (editingId === message.id) {
        resetForm();
      }

      await loadMessages();
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown delete error';
      await kbcSwal.fire({
        title: 'CEO Message Not Deleted',
        html: `The leadership message could not be deleted.<br /><br /><strong>Details:</strong> ${detail}`,
        icon: 'error',
        confirmButtonText: 'OK',
      });
    }
  };

  const handleShowOnHome = async (message: LeadershipMessage) => {
    if (message.isActive) {
      return;
    }

    try {
      const response = await fetch(`/api/leadership-message/${message.id}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardTitle: message.cardTitle,
          authorName: message.authorName,
          authorRole: message.authorRole,
          publicationDate: message.date,
          body: message.body,
          coverImageUrl: message.coverImageUrl,
          profileImageUrl: message.profileImageUrl,
          cardTeaser: 'Click to read the full message',
          isActive: true,
        }),
      });

      if (!response.ok) {
        const errorText = (await response.text()).trim();
        throw new Error(errorText || `Request failed with status ${response.status}`);
      }

      await loadMessages();
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown activation error';
      await kbcSwal.fire({
        title: 'Could Not Show Message',
        html: `The selected CEO message could not be shown on the home page.<br /><br /><strong>Details:</strong> ${detail}`,
        icon: 'error',
        confirmButtonText: 'OK',
      });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans flex flex-col">
      <TopNav />

      <div className="bg-white border-b border-gray-200 px-4 md:px-6 py-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-2 text-gray-400 text-xs mb-2">
            <button type="button" onClick={() => navigate('/')} className="hover:text-kbc-navy cursor-pointer">
              Home
            </button>
            <span>/</span>
            <span className="text-kbc-navy font-medium">Manage CEO Message</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-kbc-navy text-white shadow-sm">
              <i className="ri-user-star-line text-lg" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-kbc-navy">Manage CEO Message</h1>
              <p className="text-sm text-slate-500">
                Create, edit, or delete the leadership message shown on the home page.
              </p>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto w-full px-4 md:px-6 py-8 flex-1">
        <div className="grid gap-6 lg:grid-cols-[1.12fr_0.88fr]">
          <div className="rounded-[2rem] border border-indigo-100 bg-[linear-gradient(180deg,#ffffff_0%,#f8faff_100%)] p-6 shadow-sm">
            <div className="mb-6 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">
                  <i className="ri-quill-pen-line" />
                  {editingId ? 'Edit Message' : 'Leadership Entry'}
                </span>
                <p className="text-sm text-slate-500">
                  {editingId ? 'Update the selected CEO message.' : 'The newest saved message appears in the home hero section.'}
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddNewMessage}
                className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-sm font-semibold text-indigo-700 transition-colors hover:bg-indigo-50"
              >
                <i className="ri-add-line text-base" />
                Add New Message
              </button>
            </div>

            <div className="grid gap-5">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Card Title
                </label>
                <input
                  type="text"
                  value={form.cardTitle}
                  onChange={event => setForm(current => ({ ...current, cardTitle: event.target.value }))}
                  placeholder="e.g. Building Our Future Together!"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-indigo-400"
                />
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Author Name
                  </label>
                  <input
                    type="text"
                    value={form.authorName}
                    onChange={event => setForm(current => ({ ...current, authorName: event.target.value }))}
                    placeholder="e.g. Prof. David Kingsley"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-indigo-400"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Author Role
                  </label>
                  <input
                    type="text"
                    value={form.authorRole}
                    onChange={event => setForm(current => ({ ...current, authorRole: event.target.value }))}
                    placeholder="e.g. Principal & CEO, Kent Business College"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-indigo-400"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Message Body
                </label>
                <textarea
                  rows={8}
                  value={form.body}
                  onChange={event => setForm(current => ({ ...current, body: event.target.value }))}
                  placeholder="Write the CEO message here. Separate paragraphs with an empty line."
                  className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-7 text-slate-700 outline-none transition-colors focus:border-indigo-400"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Publication Date
                </label>
                <div ref={datePickerRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setDatePickerOpen(current => !current)}
                    className="group flex w-full items-center justify-between rounded-[1.35rem] border border-slate-200 bg-white px-4 py-3 text-left shadow-[0_10px_30px_rgba(15,23,42,0.04)] transition-all hover:border-indigo-200 hover:shadow-[0_12px_36px_rgba(79,70,229,0.08)]"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-50 to-blue-100 text-indigo-600">
                        <i className="ri-calendar-event-line text-lg" />
                      </span>
                      <div>
                        <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                          Pick a date
                        </span>
                        <span className="block text-sm font-semibold text-slate-700">
                          {formatInputDate(form.publicationDate)}
                        </span>
                      </div>
                    </div>
                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-50 text-slate-500 transition-colors group-hover:bg-indigo-50 group-hover:text-indigo-600">
                      <i className={`${datePickerOpen ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'} text-lg`} />
                    </span>
                  </button>

                  {datePickerOpen && (
                    <div className="absolute left-0 top-[calc(100%+12px)] z-20 w-full overflow-hidden rounded-[1.6rem] border border-indigo-100 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.16)]">
                      <div className="bg-[linear-gradient(135deg,#eef2ff_0%,#ffffff_100%)] px-4 pb-4 pt-4">
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-400">
                              Publication month
                            </p>
                            <h3 className="text-base font-bold text-kbc-navy">
                              {calendarMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
                            </h3>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setCalendarMonth(current => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
                              className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 transition-colors hover:border-indigo-200 hover:text-indigo-600"
                            >
                              <i className="ri-arrow-left-s-line text-lg" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setCalendarMonth(current => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
                              className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 transition-colors hover:border-indigo-200 hover:text-indigo-600"
                            >
                              <i className="ri-arrow-right-s-line text-lg" />
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-7 gap-2">
                          {weekdayLabels.map(label => (
                            <span key={label} className="flex h-9 items-center justify-center text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                              {label}
                            </span>
                          ))}

                          {calendarDays.map(day => {
                            const inCurrentMonth = day.getMonth() === calendarMonth.getMonth();
                            const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;
                            const isToday = isSameDay(day, new Date());

                            return (
                              <button
                                key={day.toISOString()}
                                type="button"
                                onClick={() => {
                                  setForm(current => ({ ...current, publicationDate: toIsoDate(day) }));
                                  setCalendarMonth(new Date(day.getFullYear(), day.getMonth(), 1));
                                  setDatePickerOpen(false);
                                }}
                                className={[
                                  'flex h-11 items-center justify-center rounded-2xl text-sm font-semibold transition-all',
                                  isSelected
                                    ? 'bg-indigo-600 text-white shadow-[0_12px_30px_rgba(79,70,229,0.22)]'
                                    : inCurrentMonth
                                      ? 'bg-white text-slate-700 hover:bg-indigo-50 hover:text-indigo-600'
                                      : 'bg-transparent text-slate-300 hover:bg-slate-50',
                                  isToday && !isSelected ? 'ring-1 ring-indigo-200' : '',
                                ].join(' ')}
                              >
                                {day.getDate()}
                              </button>
                            );
                          })}
                        </div>

                        <div className="mt-4 flex items-center justify-between gap-3 border-t border-indigo-100 pt-4">
                          <button
                            type="button"
                            onClick={() => {
                              const today = new Date();
                              setForm(current => ({ ...current, publicationDate: toIsoDate(today) }));
                              setCalendarMonth(new Date(today.getFullYear(), today.getMonth(), 1));
                              setDatePickerOpen(false);
                            }}
                            className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-indigo-600 transition-colors hover:bg-indigo-100"
                          >
                            <i className="ri-sparkling-line" />
                            Today
                          </button>
                          <button
                            type="button"
                            onClick={() => setDatePickerOpen(false)}
                            className="text-sm font-semibold text-slate-500 transition-colors hover:text-kbc-navy"
                          >
                            Done
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Cover Image
                  </label>
                  <div className="flex h-full flex-col rounded-[1.5rem] border border-slate-200 bg-white p-3">
                    <div className="mb-3 h-36 overflow-hidden rounded-2xl bg-slate-100">
                      <SafeImage
                        src={form.coverImageUrl}
                        alt="Cover preview"
                        className="h-full w-full object-cover"
                        fallback={(
                          <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,#eef2ff_0%,#f8fafc_100%)] text-slate-400" aria-hidden="true">
                            <div className="text-center">
                              <i className="ri-image-line text-3xl" />
                              <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em]">No cover image</p>
                            </div>
                          </div>
                        )}
                      />
                    </div>
                    <div className="grid gap-2">
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90">
                        <i className="ri-upload-2-line text-sm" />
                        {uploadingCover ? 'Uploading...' : 'Upload from device'}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={uploadingCover}
                          onChange={event => {
                            const file = event.target.files?.[0];
                            if (file) {
                              void uploadImageFile(file, 'coverImageUrl');
                            }
                            event.currentTarget.value = '';
                          }}
                        />
                      </label>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Profile Image
                  </label>
                  <div className="flex h-full flex-col rounded-[1.5rem] border border-slate-200 bg-white p-3">
                    <div className="mb-3 h-36 overflow-hidden rounded-2xl bg-slate-100">
                      <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,#eef2ff_0%,#f8fafc_100%)]">
                        <SafeImage
                          src={form.profileImageUrl}
                          alt="Profile preview"
                          className="h-full w-full object-cover"
                          fallback={(
                            <div className="text-center text-slate-400" aria-hidden="true">
                              <i className="ri-user-3-line text-3xl" />
                              <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em]">No profile image</p>
                            </div>
                          )}
                        />
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-kbc-navy px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90">
                        <i className="ri-image-add-line text-sm" />
                        {uploadingProfile ? 'Uploading...' : 'Upload from device'}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={uploadingProfile}
                          onChange={event => {
                            const file = event.target.files?.[0];
                            if (file) {
                              void uploadImageFile(file, 'profileImageUrl');
                            }
                            event.currentTarget.value = '';
                          }}
                        />
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 flex items-center justify-end gap-3 border-t border-indigo-100 pt-5">
              {editingId && (
                <button
                  type="button"
                  onClick={handleAddNewMessage}
                  className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100"
                >
                  Add New Message
                </button>
              )}
              <button
                type="button"
                onClick={() => navigate('/')}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100"
              >
                Back Home
              </button>
              <button
                type="button"
                onClick={() => { void handleSave(); }}
                disabled={!canSave || saving}
                className="rounded-xl bg-kbc-navy px-5 py-2.5 text-sm font-bold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? 'Saving...' : editingId ? 'Update CEO Message' : 'Save CEO Message'}
              </button>
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-kbc-navy">Existing CEO Messages</h2>
                <p className="text-sm text-slate-500">Edit or delete any leadership message already stored in the database.</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">
                {messages.length} message{messages.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="space-y-3">
              {loading ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
                  Loading messages...
                </div>
              ) : messages.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
                  No CEO messages found yet.
                </div>
              ) : (
                messages.map(message => {
                  const isEditing = editingId === message.id;
                  return (
                    <div
                      key={message.id}
                      className={`rounded-2xl border px-4 py-4 transition-all ${
                        isEditing ? 'border-indigo-300 bg-indigo-50/50 shadow-sm' : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-base font-bold text-kbc-navy">{message.cardTitle}</h3>
                            {message.isActive ? (
                              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-600">
                                Live on Home
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{message.authorName}</p>
                          <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-500">{message.body}</p>
                          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold">
                              {message.date || 'No date'}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => { void handleShowOnHome(message); }}
                            disabled={message.isActive}
                            className={`inline-flex h-10 items-center justify-center rounded-xl px-3 text-xs font-bold transition-colors ${
                              message.isActive
                                ? 'cursor-default bg-emerald-50 text-emerald-600'
                                : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                            }`}
                            title={message.isActive ? 'Already shown on home' : 'Show this message on home'}
                          >
                            {message.isActive ? 'Live' : 'Show on Home'}
                          </button>
                          <button
                            type="button"
                            onClick={() => applyEditMessage(message)}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-kbc-navy text-white transition-opacity hover:opacity-90"
                            title="Edit CEO message"
                          >
                            <i className="ri-edit-line text-lg" />
                          </button>
                          <button
                            type="button"
                            onClick={() => { void handleDelete(message); }}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600 transition-colors hover:bg-red-100"
                            title="Delete CEO message"
                          >
                            <i className="ri-delete-bin-line text-lg" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
