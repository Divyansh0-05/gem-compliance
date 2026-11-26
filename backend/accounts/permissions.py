from rest_framework.permissions import BasePermission

BUYER, BIDDER, EVALUATOR = "BUYER", "BIDDER", "EVALUATOR"


def get_role(user):
    """Role of a user; superusers without a profile are treated as buyers."""
    profile = getattr(user, "profile", None)
    if profile:
        return profile.role
    return BUYER if getattr(user, "is_superuser", False) else None


class IsBuyer(BasePermission):
    message = "Only buyers can do this."

    def has_permission(self, request, view):
        return bool(request.user.is_authenticated and get_role(request.user) == BUYER)


class IsReviewer(BasePermission):
    message = "Only buyers or evaluators can do this."

    def has_permission(self, request, view):
        return bool(request.user.is_authenticated and get_role(request.user) in (BUYER, EVALUATOR))
