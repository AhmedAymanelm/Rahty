from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, Numeric, Time, UniqueConstraint, func
from sqlalchemy.orm import relationship

from database import Base


class AttendanceSession(Base):
    __tablename__ = "attendance_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    hotel_id = Column(Integer, ForeignKey("hotels.id"), nullable=False, index=True)
    session_date = Column(Date, nullable=False, index=True)

    check_in_at = Column(DateTime(timezone=True), nullable=False)
    check_in_lat = Column(Numeric(9, 6), nullable=False)
    check_in_lng = Column(Numeric(9, 6), nullable=False)

    last_ping_at = Column(DateTime(timezone=True), nullable=True)
    last_ping_lat = Column(Numeric(9, 6), nullable=True)
    last_ping_lng = Column(Numeric(9, 6), nullable=True)

    out_of_range_since = Column(DateTime(timezone=True), nullable=True)
    checked_out_at = Column(DateTime(timezone=True), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    user = relationship("User", backref="attendance_sessions")
    hotel = relationship("Hotel", backref="attendance_sessions")


class AttendancePolicy(Base):
    __tablename__ = "attendance_policies"
    __table_args__ = (UniqueConstraint("hotel_id", name="uq_attendance_policy_hotel"),)

    id = Column(Integer, primary_key=True, index=True)
    hotel_id = Column(Integer, ForeignKey("hotels.id"), nullable=False, index=True)

    checkin_start = Column(Time, nullable=False)
    checkin_end = Column(Time, nullable=False)
    shift_end = Column(Time, nullable=False)
    export_mode = Column(Integer, nullable=False, default=0)  # 0=weekly, 1=monthly

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    hotel = relationship("Hotel", backref="attendance_policy")
