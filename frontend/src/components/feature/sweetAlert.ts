import Swal from 'sweetalert2';

export const kbcSwal = Swal.mixin({
  customClass: {
    popup: 'kbc-swal-popup',
    title: 'kbc-swal-title',
    htmlContainer: 'kbc-swal-html',
    confirmButton: 'kbc-swal-confirm',
    cancelButton: 'kbc-swal-cancel',
  },
  buttonsStyling: false,
  backdrop: 'rgba(15, 23, 42, 0.5)',
});

export const kbcSuccessSwal = Swal.mixin({
  customClass: {
    popup: 'kbc-swal-popup kbc-swal-popup-success',
    title: 'kbc-swal-title kbc-swal-title-success',
    htmlContainer: 'kbc-swal-html kbc-swal-html-success',
    confirmButton: 'kbc-swal-confirm kbc-swal-confirm-success',
  },
  buttonsStyling: false,
  backdrop: 'rgba(15, 23, 42, 0.5)',
});

export async function confirmDeleteEvent(title: string) {
  const result = await kbcSwal.fire({
    title: 'Delete Event?',
    html: `The event <strong>${title}</strong> will be removed from the calendar and cards.`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Delete',
    cancelButtonText: 'Keep Event',
    reverseButtons: true,
    focusCancel: true,
  });

  return result.isConfirmed;
}

export async function showCalendarExportInfo() {
  await kbcSuccessSwal.fire({
    title: 'Calendar File Downloaded',
    html: 'An <strong>.ics</strong> file was downloaded. You can open it in Outlook, Apple Calendar, or import it into Google Calendar to add this event to your personal calendar.',
    icon: 'success',
    confirmButtonText: 'OK',
  });
}
