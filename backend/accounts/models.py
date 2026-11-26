from django.contrib.auth.models import User
from django.db import models


class Profile(models.Model):
    """Extends the built-in User with a role and company details."""

    class Role(models.TextChoices):
        BUYER = "BUYER", "Buyer / Admin"
        BIDDER = "BIDDER", "Bidder"
        EVALUATOR = "EVALUATOR", "Evaluator"

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    role = models.CharField(max_length=12, choices=Role.choices, default=Role.BIDDER)
    company_name = models.CharField(max_length=200, blank=True)

    def __str__(self):
        return f"{self.user.username} ({self.role})"
