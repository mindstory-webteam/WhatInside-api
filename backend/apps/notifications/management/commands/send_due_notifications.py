from django.core.management.base import BaseCommand

from apps.notifications.services import dispatch_due_notifications


class Command(BaseCommand):
    help = "Send due expiry reminders (use from cron if you don't run Celery beat)."

    def handle(self, *args, **options):
        stats = dispatch_due_notifications()
        self.stdout.write(self.style.SUCCESS(f"Dispatched: {stats}"))
