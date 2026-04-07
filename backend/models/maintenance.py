import enum
from sqlalchemy import Column, Integer, String, Enum, DateTime, func, ForeignKey, Text, Boolean
from sqlalchemy.orm import relationship
from database import Base


class MaintenanceStatus(str, enum.Enum):
    reported = "reported"
    assigned = "assigned"
    in_progress = "in_progress"
    waiting_parts = "waiting_parts"
    completed = "completed"
    verified = "verified"


class MaintenanceReport(Base):
    __tablename__ = "maintenance_reports"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=False)

    hotel_id = Column(Integer, ForeignKey("hotels.id"), nullable=False)
    room_id = Column(Integer, ForeignKey("rooms.id"), nullable=False)

    reported_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    assigned_to_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=True)

    status = Column(Enum(MaintenanceStatus), default=MaintenanceStatus.reported, nullable=False)

    diagnosis = Column(Text, nullable=True)
    parts_required = Column(Boolean, default=False, nullable=False)
    parts_notes = Column(Text, nullable=True)

    before_photo_url = Column(String(500), nullable=False)
    after_photo_url = Column(String(500), nullable=True)

    verification_notes = Column(Text, nullable=True)
    closure_room_status = Column(String(20), nullable=True)

    reported_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    assigned_at = Column(DateTime(timezone=True), nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    waiting_parts_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    verified_at = Column(DateTime(timezone=True), nullable=True)
    verified_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    hotel = relationship("Hotel", backref="maintenance_reports")
    room = relationship("Room", backref="maintenance_reports")
    reported_by = relationship("User", foreign_keys=[reported_by_id], backref="reported_maintenance")
    assigned_to = relationship("User", foreign_keys=[assigned_to_id], backref="assigned_maintenance")
    verified_by = relationship("User", foreign_keys=[verified_by_id], backref="verified_maintenance")
    task = relationship("Task", backref="maintenance_report", uselist=False)

    @property
    def verified_by_name(self):
        return self.verified_by.full_name if self.verified_by else None
