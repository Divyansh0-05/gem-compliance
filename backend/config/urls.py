from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("accounts.urls")),
    path("api/", include("tenders.urls")),
    path("api/", include("bids.urls")),
    path("api/", include("compliance.urls")),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
