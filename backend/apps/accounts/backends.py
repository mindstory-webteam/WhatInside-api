from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend


class PhoneOrEmailBackend(ModelBackend):
    """Sign in with a mobile number (any common format) or, for older accounts, an email.
    Used by the Django admin; the API login view does the same lookup itself."""

    def authenticate(self, request, username=None, password=None, **kwargs):
        User = get_user_model()
        username = username or kwargs.get(User.USERNAME_FIELD) or kwargs.get("email")
        if not username or password is None:
            return None
        try:
            user = User._default_manager.get_by_natural_key(username)
        except User.DoesNotExist:
            User().set_password(password)  # same work as a real check: no timing hint
            return None
        if user.check_password(password) and self.user_can_authenticate(user):
            return user
        return None
