"""Sends call-centre email through Microsoft 365 (Graph ``sendMail``) as the college's no-reply mailbox.

The app registration is ``CALLCENTRE_MAIL_TENANT_ID`` / ``CALLCENTRE_MAIL_CLIENT_ID`` /
``CALLCENTRE_MAIL_CLIENT_SECRET`` (Graph profile ``mail``), sending as ``CALLCENTRE_MAIL_SENDER``. It needs the
*application* permission ``Mail.Send`` with admin consent, ideally limited to that one mailbox by an application
access policy. This is the same method the LMS uses for its invitations (``login/email_azure.py``).
"""
from django.conf import settings

from . import graph

SENDER_NAME = 'KBC Learner Support'


class MailError(RuntimeError):
    """The message was not accepted. ``uncertain`` means it may still have gone (a timeout or dropped connection)."""

    def __init__(self, message, uncertain=False):
        super().__init__(message)
        self.uncertain = uncertain


def sender():
    return str(getattr(settings, 'CALLCENTRE_MAIL_SENDER', '') or '').strip()


def missing():
    """Settings still to set before email can be sent (names only)."""
    return graph.missing('mail') + ([] if sender() else ['CALLCENTRE_MAIL_SENDER'])


def configured():
    return not missing()


def send(to, subject, html, cc=(), sender_name=SENDER_NAME):
    """Send one HTML message; a copy is kept in the no-reply mailbox's Sent Items. Raises MailError."""
    if not configured():
        raise MailError(f'Email sending is not configured: {", ".join(missing())}.')
    mailbox = sender()
    message = {
        'subject': subject,
        'body': {'contentType': 'HTML', 'content': html},
        'toRecipients': [{'emailAddress': {'address': to}}],
        'ccRecipients': [{'emailAddress': {'address': address}} for address in cc if address],
        'from': {'emailAddress': {'address': mailbox, 'name': sender_name}},
    }
    try:
        graph.request('POST', f'{graph.user_path(mailbox)}/sendMail', {'message': message, 'saveToSentItems': True},
                      profile='mail')
    except graph.GraphError as exc:
        # An HTTP refusal is a definite failure; no status means the request may or may not have reached Microsoft.
        raise MailError(str(exc), uncertain=exc.status is None) from exc
