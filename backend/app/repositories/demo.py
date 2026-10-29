"""Process-local demo storage; replace this repository when adding persistence."""

import json
from copy import deepcopy
from threading import RLock

from app.core.errors import ResourceConflict, ResourceNotFound
from app.data import fixture


class DemoRepository:
    def __init__(self):
        self._fields = {field["id"]: field for field in fixture("fields")["fields"]}
        self._responses = {}
        self._lock = RLock()

    def fields(self):
        with self._lock:
            return deepcopy(list(self._fields.values()))

    def field(self, field_id: int):
        with self._lock:
            return deepcopy(self._fields.get(field_id))

    def require_field(self, field_id: int):
        field = self.field(field_id)
        if field is None:
            raise ResourceNotFound("Field not found")
        return field

    def create(self, parcel_id: int, name: str, crop: str):
        seeds = fixture("fields")
        parcel = next((p for p in seeds["parcels"] if p["id"] == parcel_id), None)
        if parcel is None:
            raise ResourceNotFound("Parcel not found")
        with self._lock:
            if parcel_id in self._fields:
                raise ResourceConflict("Parcel is unavailable")
            field = dict(
                id=parcel_id,
                name=name,
                crop=crop,
                area=parcel["area"],
                health=86,
                moisture=59,
                nitrogen=40,
                status="Healthy",
                planted="May 1, 2026",
            )
            self._fields[parcel_id] = field
            return deepcopy(field)

    def remove(self, field_id: int):
        with self._lock:
            self.require_field(field_id)
            del self._fields[field_id]
            self._responses = {
                key: value
                for key, value in self._responses.items()
                if not key.startswith(f"field-{field_id}-")
            }
            return field_id

    def responses(self):
        with self._lock:
            return deepcopy(self._responses)

    def respond(self, field_id: int, events: list, status: str):
        with self._lock:
            self.require_field(field_id)
            for event in events:
                if status == "proposed":
                    self._responses.pop(event["id"], None)
                else:
                    fingerprint = json.dumps(
                        [
                            event[key]
                            for key in ("id", "fieldId", "date", "title", "description", "duration")
                        ],
                        ensure_ascii=False,
                        separators=(",", ":"),
                    )
                    self._responses[event["id"]] = dict(status=status, fingerprint=fingerprint)
            return deepcopy(self._responses)
