from django.contrib.auth.models import Group
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.contrib.auth import get_user_model

User = get_user_model()

@receiver(post_save, sender=User)
def add_default_group(sender, instance, created, **kwargs):
    if created and instance.groups.count() == 0:
        guest_group, _ = Group.objects.get_or_create(name="guest")
        instance.groups.add(guest_group)
