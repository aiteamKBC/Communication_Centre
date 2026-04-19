import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import TopNav from '../../components/feature/TopNav';
import Footer from '../../components/feature/Footer';
import { kbcSuccessSwal, kbcSwal } from '../../components/feature/sweetAlert';

type UrgentNotice = {
  id: string;
  title: string;
  body: string;
  isActive?: boolean;
  date: string;
};

type UrgentNoticePayload = {
  title: string;
  body: string;
  publicationDate: string;
};

const emptyForm: UrgentNoticePayload = {
  title: '',
  body: '',
  publicationDate: new Date().toISOString().slice(0, 10),
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

function toPayload(notice: UrgentNotice): UrgentNoticePayload {
  return {
    title: notice.title,
    body: notice.body,
    publicationDate: notice.date || new Date().toISOString().slice(0, 10),
  };
}

export default function UrgentNoticePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState<UrgentNoticePayload>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notices, setNotices] = useState<UrgentNotice[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const initial = emptyForm.publicationDate ? new Date(`${emptyForm.publicationDate}T00:00:00`) : new Date();
    return new Date(initial.getFullYear(), initial.getMonth(), 1);
  });
  const datePickerRef = useRef<HTMLDivElement | null>(null);

  const canSave = useMemo(
    () => Boolean(form.title.trim()) && Boolean(form.body.trim()) && Boolean(form.publicationDate),
    [form.body, form.publicationDate, form.title],
  );
  const selectedDate = form.publicationDate ? new Date(`${form.publicationDate}T00:00:00`) : null;
  const calendarDays = useMemo(() => buildMonthDays(calendarMonth), [calendarMonth]);

  const applyEditNotice = (notice: UrgentNotice) => {
    setEditingId(notice.id);
    setForm(toPayload(notice));
    const noticeDate = notice.date ? new Date(`${notice.date}T00:00:00`) : new Date();
    setCalendarMonth(new Date(noticeDate.getFullYear(), noticeDate.getMonth(), 1));
    setDatePickerOpen(false);
  };

  const loadNotices = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/urgent-notice/?list=1');
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const payload = await response.json() as UrgentNotice[];
      setNotices(Array.isArray(payload) ? payload : []);
    } catch {
      setNotices([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadNotices();
  }, []);

  useEffect(() => {
    const editId = searchParams.get('edit');
    if (!editId || notices.length === 0) {
      return;
    }

    const targetNotice = notices.find(notice => notice.id === editId);
    if (targetNotice) {
      applyEditNotice(targetNotice);
    }
  }, [notices, searchParams]);

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
    const initial = emptyForm.publicationDate ? new Date(`${emptyForm.publicationDate}T00:00:00`) : new Date();
    setCalendarMonth(new Date(initial.getFullYear(), initial.getMonth(), 1));
    setDatePickerOpen(false);
  };

  const handleAddNewNotice = () => {
    resetForm();
    navigate('/urgent-notice/new');
  };

  const handleSave = async (saveAsNew = false) => {
    if (!canSave || saving) {
      await kbcSwal.fire({
        title: 'Complete Required Fields',
        html: 'Fill in the <strong>Title</strong>, <strong>Message</strong>, and <strong>Publication Date</strong> before saving.',
        icon: 'warning',
        confirmButtonText: 'OK',
      });
      return;
    }

    try {
      setSaving(true);
      const shouldUpdate = Boolean(editingId) && !saveAsNew;
      const response = await fetch(shouldUpdate ? `/api/urgent-notice/${editingId}/` : '/api/urgent-notice/', {
        method: shouldUpdate ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      if (!response.ok) {
        const errorText = (await response.text()).trim();
        throw new Error(errorText || `Request failed with status ${response.status}`);
      }

      await kbcSuccessSwal.fire({
        title: shouldUpdate ? 'Urgent Notice Updated' : 'Urgent Notice Saved',
        html: shouldUpdate
          ? 'The urgent notice was updated successfully.'
          : 'The urgent notice was added to the database successfully.',
        icon: 'success',
        confirmButtonText: 'OK',
      });

      resetForm();
      await loadNotices();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown save error';
      await kbcSwal.fire({
        title: editingId && !saveAsNew ? 'Urgent Notice Not Updated' : 'Urgent Notice Not Saved',
        html: `The urgent notice could not be saved.<br /><br /><strong>Details:</strong> ${message}`,
        icon: 'error',
        confirmButtonText: 'OK',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (notice: UrgentNotice) => {
    const result = await kbcSwal.fire({
      title: 'Delete Urgent Notice?',
      html: `The notice <strong>${notice.title}</strong> will be removed from the database.`,
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
      const response = await fetch(`/api/urgent-notice/${notice.id}/`, { method: 'DELETE' });
      if (!response.ok) {
        const errorText = (await response.text()).trim();
        throw new Error(errorText || `Request failed with status ${response.status}`);
      }

      if (editingId === notice.id) {
        resetForm();
      }

      await loadNotices();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown delete error';
      await kbcSwal.fire({
        title: 'Urgent Notice Not Deleted',
        html: `The urgent notice could not be deleted.<br /><br /><strong>Details:</strong> ${message}`,
        icon: 'error',
        confirmButtonText: 'OK',
      });
    }
  };

  const handleShowOnHome = async (notice: UrgentNotice) => {
    if (notice.isActive) {
      return;
    }

    try {
      const response = await fetch(`/api/urgent-notice/${notice.id}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: notice.title,
          body: notice.body,
          publicationDate: notice.date,
          isActive: true,
        }),
      });

      if (!response.ok) {
        const errorText = (await response.text()).trim();
        throw new Error(errorText || `Request failed with status ${response.status}`);
      }

      await loadNotices();
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown activation error';
      await kbcSwal.fire({
        title: 'Could Not Show Notice',
        html: `The selected urgent notice could not be shown on the home page.<br /><br /><strong>Details:</strong> ${detail}`,
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
            <span className="text-kbc-navy font-medium">Manage Urgent Notice</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-kbc-red text-white shadow-sm">
              <i className="ri-alarm-warning-line text-lg" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-kbc-navy">Manage Urgent Notice</h1>
              <p className="text-sm text-slate-500">
                Create, edit, or delete the notices shown on the home page.
              </p>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto w-full px-4 md:px-6 py-8 flex-1">
        <div className="grid gap-6 lg:grid-cols-[1.4fr_0.95fr]">
          <div className="rounded-[2rem] border border-red-200 bg-[linear-gradient(180deg,#ffffff_0%,#fff8f8_100%)] p-7 shadow-sm">
            <div className="mb-6 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-red-600">
                  <i className="ri-error-warning-line" />
                  {editingId ? 'Edit Notice' : 'Manual Notice Entry'}
                </span>
                <p className="text-sm text-slate-500">
                  {editingId ? 'Update the selected urgent notice.' : 'The newest saved urgent notice appears on the home page.'}
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddNewNotice}
                className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50"
              >
                <i className="ri-add-line text-base" />
                Add New Notice
              </button>
            </div>

            <div className="grid gap-5">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Title
                </label>
                <input
                  type="text"
                  value={form.title}
                  onChange={event => setForm(current => ({ ...current, title: event.target.value }))}
                  placeholder="e.g. IMPORTANT: Compliance Audit Due 30th April"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-kbc-red"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Message
                </label>
                <textarea
                  rows={5}
                  value={form.body}
                  onChange={event => setForm(current => ({ ...current, body: event.target.value }))}
                  placeholder="Write the urgent message that should appear on the home page."
                  className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-kbc-red"
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
                    className="group flex w-full items-center justify-between rounded-[1.35rem] border border-slate-200 bg-white px-4 py-3 text-left shadow-[0_10px_30px_rgba(15,23,42,0.04)] transition-all hover:border-red-200 hover:shadow-[0_12px_36px_rgba(220,38,38,0.08)]"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-red-50 to-rose-100 text-kbc-red">
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
                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-50 text-slate-500 transition-colors group-hover:bg-red-50 group-hover:text-kbc-red">
                      <i className={`${datePickerOpen ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'} text-lg`} />
                    </span>
                  </button>

                  {datePickerOpen && (
                    <div className="absolute left-0 top-[calc(100%+12px)] z-20 w-full overflow-hidden rounded-[1.6rem] border border-red-100 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.16)]">
                      <div className="bg-[linear-gradient(135deg,#fff5f5_0%,#ffffff_100%)] px-4 pb-4 pt-4">
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-400">
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
                              className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 transition-colors hover:border-red-200 hover:text-kbc-red"
                            >
                              <i className="ri-arrow-left-s-line text-lg" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setCalendarMonth(current => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
                              className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 transition-colors hover:border-red-200 hover:text-kbc-red"
                            >
                              <i className="ri-arrow-right-s-line text-lg" />
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-7 gap-2">
                          {weekdayLabels.map(label => (
                            <span
                              key={label}
                              className="flex h-9 items-center justify-center text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400"
                            >
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
                                    ? 'bg-kbc-red text-white shadow-[0_12px_30px_rgba(220,38,38,0.22)]'
                                    : inCurrentMonth
                                      ? 'bg-white text-slate-700 hover:bg-red-50 hover:text-kbc-red'
                                      : 'bg-transparent text-slate-300 hover:bg-slate-50',
                                  isToday && !isSelected ? 'ring-1 ring-red-200' : '',
                                ].join(' ')}
                              >
                                {day.getDate()}
                              </button>
                            );
                          })}
                        </div>

                        <div className="mt-4 flex items-center justify-between gap-3 border-t border-red-100 pt-4">
                          <button
                            type="button"
                            onClick={() => {
                              const today = new Date();
                              setForm(current => ({ ...current, publicationDate: toIsoDate(today) }));
                              setCalendarMonth(new Date(today.getFullYear(), today.getMonth(), 1));
                              setDatePickerOpen(false);
                            }}
                            className="inline-flex items-center gap-2 rounded-full bg-red-50 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-kbc-red transition-colors hover:bg-red-100"
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
            </div>

            <div className="mt-8 flex items-center justify-end gap-3 border-t border-red-100 pt-5">
              <button
                type="button"
                onClick={handleAddNewNotice}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100"
              >
                Add New Notice
              </button>
              <button
                type="button"
                onClick={() => navigate('/')}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100"
              >
                Back Home
              </button>
              <button
                type="button"
                onClick={() => { void handleSave(false); }}
                disabled={!canSave || saving}
                className="rounded-xl bg-kbc-red px-5 py-2.5 text-sm font-bold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? 'Saving...' : editingId ? 'Update Urgent Notice' : 'Save Urgent Notice'}
              </button>
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-kbc-navy">Existing Notices</h2>
                <p className="text-sm text-slate-500">Edit or delete any urgent notice already stored in the database.</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">
                {notices.length} notice{notices.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="space-y-3">
              {loading ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
                  Loading notices...
                </div>
              ) : notices.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
                  No urgent notices found yet.
                </div>
              ) : (
                notices.map(notice => {
                  const isEditing = editingId === notice.id;
                  return (
                    <div
                      key={notice.id}
                      className={`rounded-2xl border px-4 py-4 transition-all ${
                        isEditing ? 'border-kbc-red bg-red-50/50 shadow-sm' : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate text-base font-bold text-kbc-navy">{notice.title}</h3>
                          <p className="mt-1 line-clamp-3 text-sm leading-6 text-slate-500">{notice.body}</p>
                          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold">
                              {notice.date || 'No date'}
                            </span>
                            {notice.isActive ? (
                              <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">
                                Live on Home
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => { void handleShowOnHome(notice); }}
                            disabled={Boolean(notice.isActive)}
                            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
                              notice.isActive
                                ? 'cursor-default bg-emerald-50 text-emerald-700'
                                : 'bg-emerald-600 text-white hover:bg-emerald-700'
                            }`}
                            title={notice.isActive ? 'Currently shown on home page' : 'Show this notice on the home page'}
                          >
                            <i className={`${notice.isActive ? 'ri-home-smile-line' : 'ri-home-4-line'} text-sm`} />
                            {notice.isActive ? 'Live' : 'Show on Home'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              applyEditNotice(notice);
                            }}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-kbc-navy text-white transition-opacity hover:opacity-90"
                            title="Edit urgent notice"
                          >
                            <i className="ri-edit-line text-lg" />
                          </button>
                          <button
                            type="button"
                            onClick={() => { void handleDelete(notice); }}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600 transition-colors hover:bg-red-100"
                            title="Delete urgent notice"
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
