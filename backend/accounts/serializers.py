from django.contrib.auth.models import User
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import Profile
from .permissions import get_role


class UserSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()
    company_name = serializers.SerializerMethodField()
    full_name = serializers.CharField(source="first_name", read_only=True)

    class Meta:
        model = User
        fields = ("id", "username", "email", "full_name", "role", "company_name")

    def get_role(self, obj):
        return get_role(obj)

    def get_company_name(self, obj):
        return obj.profile.company_name if hasattr(obj, "profile") else ""


class RegisterSerializer(serializers.Serializer):
    username = serializers.CharField(min_length=3, max_length=150)
    password = serializers.CharField(min_length=6, write_only=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    full_name = serializers.CharField(required=False, allow_blank=True, max_length=150)
    role = serializers.ChoiceField(choices=[Profile.Role.BIDDER, Profile.Role.BUYER], default=Profile.Role.BIDDER)
    company_name = serializers.CharField(required=False, allow_blank=True, max_length=200)

    def validate_username(self, value):
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("This username is already taken.")
        return value

    def create(self, data):
        user = User.objects.create_user(
            username=data["username"], password=data["password"],
            email=data.get("email", ""), first_name=data.get("full_name", ""),
        )
        Profile.objects.create(user=user, role=data["role"], company_name=data.get("company_name", ""))
        return user


class LoginSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        data["user"] = UserSerializer(self.user).data
        return data
