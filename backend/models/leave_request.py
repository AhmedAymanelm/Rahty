import enum
from sqlalchemy import Column, Integer, Enum, DateTime, Date, func, ForeignKey, Text
from sqlalchemy.orm import relationship
from database import Base


class LeaveType(str, enum.Enum):
    annual = "annual"           # إجازة سنوية
    sick = "sick"               # إجازة مرضية
    emergency = "emergency"     # إجازة طارئة
    unpaid = "unpaid"           # إجازة بدون راتب


class LeaveStatus(str, enum.Enum):
    pending = "pending"         # قيد المراجعة
    approved = "approved"       # مقبولة
    rejected = "rejected"       # مرفوضة


class LeaveRequest(Base):
    __tablename__ = "leave_requests"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    hotel_id = Column(Integer, ForeignKey("hotels.id"), nullable=False, index=True)

    leave_type = Column(Enum(LeaveType), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    reason = Column(Text, nullable=True)

    status = Column(Enum(LeaveStatus), default=LeaveStatus.pending, nullable=False)
    reviewed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    review_notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    user = relationship("User", foreign_keys=[user_id], backref="leave_requests")
    reviewed_by = relationship("User", foreign_keys=[reviewed_by_id], backref="leave_reviews")
    hotel = relationship("Hotel", backref="leave_requests")
