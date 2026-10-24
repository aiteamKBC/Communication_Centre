"""Errors a page can show where they happened."""


class FieldError(ValueError):
    """A problem with one field of a form: the page shows ``message`` next to ``field`` and puts the cursor there."""

    def __init__(self, field, message):
        super().__init__(message)
        self.field = field
