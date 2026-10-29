"""Normalized JSON collections loaded into an isolated, process-local repository."""

import json
from copy import deepcopy
from pathlib import Path
from threading import RLock
from uuid import UUID, uuid4

from app.core.errors import ResourceConflict, ResourceNotFound

# Relationships are checked on startup and used for cascade deletion.
REFERENCES = {
    "farms": {"ownerId": "users", "weatherStationId": "weather_stations"},
    "fields": {"farmId": "farms", "parcelId": "parcels", "cropId": "crops"},
    "parcels": {"farmId": "farms", "soilProfileId": "soil_profiles", "suggestedCropId": "crops"},
    "crops": {"nextCropId": "crops"},
    "history_events": {"fieldId": "fields"},
    "field_readings": {"fieldId": "fields"},
    "crop_seasons": {"fieldId": "fields", "cropId": "crops"},
    "rotation_plans": {"fieldId": "fields", "nextCropId": "crops", "followingCropId": "crops"},
    "planned_events": {"fieldId": "fields", "checkpointId": "checkpoints"},
    "strategy_forecasts": {"fieldId": "fields"},
    "strategy_technicals": {"fieldId": "fields"},
    "strategy_comparisons": {"fieldId": "fields"},
    "recommendations": {"fieldId": "fields"},
    "plan_contingencies": {"planId": "rotation_plans", "contingencyId": "contingencies"},
    "event_responses": {"eventId": "planned_events"},
    "planning_contexts": {"farmId": "farms"},
    "notifications": {"farmId": "farms", "fieldId": "fields"},
    "current_weather": {"stationId": "weather_stations"},
    "weather_history": {"stationId": "weather_stations"},
    "weather_forecasts": {"weatherId": "current_weather"},
    "event_templates": {"checkpointId": "checkpoints"},
}


class DemoRepository:
    def __init__(self, data_directory: Path | None = None):
        self._lock = RLock()
        self._tables = {}
        for path in sorted((data_directory or Path(__file__).parents[1] / "data").glob("*.json")):
            rows = json.loads(path.read_text())
            if not isinstance(rows, list):
                raise ValueError(f"{path.name} must be an array of records")
            table = {row["id"]: row for row in rows}
            if len(table) != len(rows):
                raise ValueError(f"Duplicate primary key in {path.name}")
            self._tables[path.stem] = table
        self.validate()

    def validate(self):
        for table, relationships in REFERENCES.items():
            for row in self._tables[table].values():
                for column, target in relationships.items():
                    if row.get(column) is None:
                        if table == "notifications" and column == "fieldId":
                            continue
                        raise ValueError(f"Missing reference {table}.{column}")
                    if row[column] not in self._tables[target]:
                        raise ValueError(f"Invalid reference {table}.{column}: {row[column]}")
        unique_keys = {
            "rotation_plans": ("fieldId",),
            "recommendations": ("fieldId",),
            "crop_seasons": ("fieldId", "year"),
            "field_readings": ("fieldId", "date"),
            "event_responses": ("eventId",),
            "plan_contingencies": ("planId", "contingencyId"),
            "crops": ("name",),
            "checkpoints": ("category",),
        }
        for table, columns in unique_keys.items():
            values = [
                tuple(row[column] for column in columns) for row in self._tables[table].values()
            ]
            if len(values) != len(set(values)):
                raise ValueError(f"Duplicate unique key in {table}: {columns}")
        occupied = set()
        for row in self._tables["fields"].values():
            UUID(row["id"])
            if not self.related("field_readings", "fieldId", row["id"]):
                raise ValueError("Each field must have a current reading")
            if row["parcelId"] in occupied:
                raise ValueError("A parcel can have only one active field")
            occupied.add(row["parcelId"])
            if row["properties"]["soilProfileId"] not in self._tables["soil_profiles"]:
                raise ValueError("Invalid field soil profile")

    def all(self, table):
        with self._lock:
            return deepcopy(list(self._tables[table].values()))

    def require(self, table, record_id):
        with self._lock:
            row = self._tables[table].get(record_id)
            if row is None:
                raise ResourceNotFound(f"{table.replace('_', ' ').capitalize()} record not found")
            return deepcopy(row)

    def related(self, table, column, value):
        if isinstance(value, UUID):
            value = str(value)
        with self._lock:
            return deepcopy(
                [row for row in self._tables[table].values() if row.get(column) == value]
            )

    def field(self, field_id):
        with self._lock:
            row = self._tables["fields"].get(field_id)
            if row is None:
                return None
            field = deepcopy(row)
            readings = self.related("field_readings", "fieldId", field_id)
            if readings:
                latest = max(readings, key=lambda reading: reading["date"])
                field.update({key: latest[key] for key in ("health", "moisture", "nitrogen")})
            field["crop"] = self.require("crops", row["cropId"])["name"]
            details = field["properties"]
            soil = self.require("soil_profiles", details["soilProfileId"])
            soil.pop("id")
            combined = dict(soil, **details["crop"])
            field["properties"] = dict(details, soil=combined, crop=deepcopy(combined))
            return field

    def fields(self):
        with self._lock:
            return [self.field(fid) for fid in self._tables["fields"]]

    def require_field(self, field_id):
        result = self.field(str(field_id))
        if result is None:
            raise ResourceNotFound("Field not found")
        return result

    def parcel(self, parcel_id):
        parcel = self.require("parcels", parcel_id)
        return dict(
            parcel,
            crop=self.require("crops", parcel["suggestedCropId"])["name"],
            soilType=self.require("soil_profiles", parcel["soilProfileId"])["soilType"],
        )

    def create(self, parcel_id, name, crop):
        from app.services.provisioning import field_records

        parcel = self.require("parcels", parcel_id)
        crop_record = next((row for row in self.all("crops") if row["name"] == crop), None)
        if crop_record is None:
            raise ResourceNotFound("Crop not found")
        with self._lock:
            if self.related("fields", "parcelId", parcel_id):
                raise ResourceConflict("Parcel is unavailable")
            fid = str(uuid4())
            row = dict(
                id=fid,
                farmId=parcel["farmId"],
                parcelId=parcel_id,
                cropId=crop_record["id"],
                name=name,
                area=parcel["area"],
                geometry=parcel["geometry"],
                status="Healthy",
                planted="May 1, 2026",
                properties=dict(
                    soilProfileId=parcel["soilProfileId"],
                    crop=crop_record["defaults"],
                    growthStage=crop_record["growthStage"],
                    lastSample="May 23, 2026 · 0–30 cm depth",
                    cultivationPractice="Reduced tillage",
                    tenure="Owner operated",
                ),
            )
            # Build before committing so failed provisioning never leaves partial related data.
            soil = self.require("soil_profiles", parcel["soilProfileId"])
            soil.pop("id")
            combined = dict(soil, **crop_record["defaults"])
            view = dict(
                row,
                health=86,
                moisture=59,
                nitrogen=40,
                crop=crop,
                properties=dict(row["properties"], soil=combined, crop=deepcopy(combined)),
            )
            records = field_records(
                view,
                {
                    name: self.all(name)
                    for name in (
                        "crops",
                        "contingencies",
                        "event_templates",
                        "technical_templates",
                        "checkpoints",
                        "planning_contexts",
                    )
                },
            )
            self._tables["fields"][fid] = deepcopy(row)
            for table, rows in records.items():
                self._tables[table].update({record["id"]: deepcopy(record) for record in rows})
            return self.field(fid)

    def remove(self, field_id):
        fid = str(field_id)
        with self._lock:
            self.require_field(fid)
            pending = [("fields", {fid})]
            while pending:
                table, ids = pending.pop()
                for related, relationships in REFERENCES.items():
                    for column, target in relationships.items():
                        if target == table:
                            related_ids = {
                                row["id"]
                                for row in self._tables[related].values()
                                if row.get(column) in ids
                            }
                            if related_ids:
                                pending.append((related, related_ids))
                for record_id in ids:
                    self._tables[table].pop(record_id, None)
            return fid

    def responses(self):
        with self._lock:
            return {
                row["eventId"]: dict(status=row["status"], fingerprint=row["fingerprint"])
                for row in self.all("event_responses")
            }

    def respond(self, field_id, events, status):
        with self._lock:
            self.require_field(field_id)
            table = self._tables["event_responses"]
            for event in events:
                existing = next(
                    (row for row in table.values() if row["eventId"] == event["id"]), None
                )
                if status == "proposed":
                    if existing:
                        del table[existing["id"]]
                    continue
                response_id = existing["id"] if existing else str(uuid4())
                fingerprint = json.dumps(
                    [
                        event[k]
                        for k in ("id", "fieldId", "date", "title", "description", "duration")
                    ],
                    ensure_ascii=False,
                    separators=(",", ":"),
                )
                table[response_id] = dict(
                    id=response_id, eventId=event["id"], status=status, fingerprint=fingerprint
                )
            return self.responses()
