import enum
from sqlalchemy import Column, Integer, String, Enum, DateTime, func, ForeignKey, Text
from sqlalchemy.orm import relationship
from database import Base


class WarningType(str, enum.Enum):
    verbal = "verbal"       # إنذار شفهي
    written = "written"     # إنذار كتابي
    final = "final"         # إنذار نهائي


class EmployeeWarning(Base):
    __tablename__ = "employee_warnings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    issued_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    hotel_id = Column(Integer, ForeignKey("hotels.id"), nullable=False, index=True)

    warning_type = Column(Enum(WarningType), nullable=False, default=WarningType.verbal)
    reason = Column(Text, nullable=False)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    user = relationship("User", foreign_keys=[user_id], backref="warnings_received")
    issued_by = relationship("User", foreign_keys=[issued_by_id], backref="warnings_issued")
    hotel = relationship("Hotel", backref="employee_warnings")
