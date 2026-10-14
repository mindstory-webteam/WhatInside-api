from drf_spectacular.utils import extend_schema
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenRefreshView

from . import services
from .serializers import (
    ChangePasswordSerializer,
    DeleteAccountSerializer,
    LoginSerializer,
    LogoutSerializer,
    OtpRequestSerializer,
    OtpResponseSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    RegisterSerializer,
    TokenPairResponseSerializer,
    UserSerializer,
    tokens_for,
)


class OtpRequestView(APIView):
    """Step 1 of sign-up / password reset: text a 6-digit code to the mobile number."""

    permission_classes = [permissions.AllowAny]
    throttle_scope = "otp"

    @extend_schema(request=OtpRequestSerializer, responses={202: OtpResponseSerializer})
    def post(self, request):
        serializer = OtpRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = services.request_otp(**serializer.validated_data)
        return Response(data, status=status.HTTP_202_ACCEPTED)


class RegisterView(APIView):
    """Step 2 of sign-up: verify the SMS code and create the account."""

    permission_classes = [permissions.AllowAny]
    throttle_scope = "auth"

    @extend_schema(request=RegisterSerializer, responses={201: TokenPairResponseSerializer})
    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = services.register_with_phone(**serializer.validated_data)
        return Response(tokens_for(user), status=status.HTTP_201_CREATED)


class LoginView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_scope = "auth"

    @extend_schema(request=LoginSerializer, responses={200: TokenPairResponseSerializer})
    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(tokens_for(serializer.validated_data["user"]))


class RefreshView(TokenRefreshView):
    throttle_scope = "auth"


class LogoutView(APIView):
    """Blacklists the supplied refresh token so it can't mint new access tokens."""

    @extend_schema(request=LogoutSerializer, responses={205: None})
    def post(self, request):
        serializer = LogoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            token = RefreshToken(serializer.validated_data["refresh"])
            if str(token.get("user_id")) != str(request.user.pk):
                return Response(status=status.HTTP_205_RESET_CONTENT)
            token.blacklist()
        except TokenError:
            pass  # already invalid/expired — logout is still successful
        return Response(status=status.HTTP_205_RESET_CONTENT)


class LogoutAllView(APIView):
    @extend_schema(request=None, responses={205: None})
    def post(self, request):
        services.revoke_all_tokens(request.user)
        return Response(status=status.HTTP_205_RESET_CONTENT)


class PasswordResetRequestView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_scope = "password_reset"

    @extend_schema(request=PasswordResetRequestSerializer, responses={202: None})
    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        phone = serializer.validated_data.get("phone")
        if phone:
            data = services.request_otp(phone, "reset")
            return Response({**data, "detail": "If this number has an account, we've sent a code."},
                            status=status.HTTP_202_ACCEPTED)
        services.send_password_reset(serializer.validated_data["email"])
        return Response(
            {"detail": "If an account exists for this email, a reset link has been sent."},
            status=status.HTTP_202_ACCEPTED,
        )


class PasswordResetConfirmView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_scope = "password_reset"

    @extend_schema(request=PasswordResetConfirmSerializer, responses={200: None})
    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        v = serializer.validated_data
        if v.get("phone"):
            services.reset_password_with_otp(phone=v["phone"], otp=v["otp"], new_password=v["new_password"])
            return Response({"detail": "Password updated. Please sign in again."})
        ok = services.confirm_password_reset(v["uid"], v["token"], v["new_password"])
        if not ok:
            return Response(
                {"error": {"code": "invalid_token", "message": "This reset link is invalid or has expired.",
                           "details": None}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response({"detail": "Password updated. Please sign in again."})


class ChangePasswordView(APIView):
    @extend_schema(request=ChangePasswordSerializer, responses={200: None})
    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data["new_password"])
        request.user.save(update_fields=["password", "updated_at"])
        services.revoke_all_tokens(request.user)
        return Response({"detail": "Password changed. Please sign in again."})


class MeView(generics.RetrieveUpdateAPIView):
    serializer_class = UserSerializer
    http_method_names = ["get", "patch", "delete"]

    def get_object(self):
        return self.request.user

    @extend_schema(request=DeleteAccountSerializer, responses={204: None})
    def delete(self, request):
        serializer = DeleteAccountSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        services.delete_account(request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)
