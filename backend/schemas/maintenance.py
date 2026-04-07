from datetime import datetime
from pydantic import BaseModel, Field
from typing import Optional


class MaintenanceReportCreate(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: str = Field(min_length=3)
    room_id: int
    assigned_to_id: Optional[int] = None
    before_photo_url: str = Field(min_length=5, max_length=500)


class MaintenanceAssignRequest(BaseModel):
    assigned_to_id: int


class MaintenanceDiagnoseRequest(BaseModel):
    diagnosis: str = Field(min_length=3)
    parts_required: bool = False
    parts_notes: Optional[str] = None


class MaintenanceStartRequest(BaseModel):
    note: Optional[str] = None


class MaintenanceCompleteRequest(BaseModel):
    after_photo_url: str = Field(min_length=5, max_length=500)


class MaintenancePhotoUpdateRequest(BaseModel):
    photo_url: str = Field(min_length=5, max_length=500)


class MaintenanceVerifyRequest(BaseModel):
    room_status: str = "ready"
    verification_notes: Optional[str] = None


class MaintenanceReportOut(BaseModel):
    id: int
    title: str
    description: str
    hotel_id: int
    room_id: int
    reported_by_id: int
    assigned_to_id: Optional[int]
    task_id: Optional[int]

    status: str

    diagnosis: Optional[str]
    parts_required: bool
    parts_notes: Optional[str]

    before_photo_url: str
    after_photo_url: Optional[str]

    verification_notes: Optional[str]
    closure_room_status: Optional[str]

    reported_at: datetime
    assigned_at: Optional[datetime]
    started_at: Optional[datetime]
    waiting_parts_at: Optional[datetime]
    completed_at: Optional[datetime]
    verified_at: Optional[datetime]
    verified_by_id: Optional[int] = None
    verified_by_name: Optional[str] = None

    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class MaintenanceMetricsOut(BaseModel):
    total_reports: int
    open_reports: int
    completed_reports: int
    verified_reports: int
    avg_repair_minutes: Optional[float]
