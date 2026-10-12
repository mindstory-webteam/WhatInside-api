from celery import shared_task

from . import services


@shared_task(name="apps.notifications.tasks.dispatch_due_notifications")
def dispatch_due_notifications():
    return services.dispatch_due_notifications()
