import enum
from sqlalchemy import Column, Integer, String, Enum, DateTime, func, ForeignKey, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from database import Base


class BroadcastTargetRole(str, enum.Enum):
    all = "all"
    supervisor = "supervisor"
    superfv = "superfv"
    cleaner = "cleaner"
    maintenance = "maintenance"
    reception = "reception"
    accountant = "accountant"


class Broadcast(Base):
    __tablename__ = "broadcasts"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    message = Column(Text, nullable=False)

    target_role = Column(Enum(BroadcastTargetRole), nullable=False, default=BroadcastTargetRole.all)
    hotel_id = Column(Integer, ForeignKey("hotels.id"), nullable=True)

    creator_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    creator = relationship("User", backref="created_broadcasts")
    hotel = relationship("Hotel", backref="broadcasts")


class BroadcastRead(Base):
    __tablename__ = "broadcast_reads"
    __table_args__ = (UniqueConstraint("broadcast_id", "user_id", name="uq_broadcast_read"),)

    id = Column(Integer, primary_key=True, index=True)
    broadcast_id = Column(Integer, ForeignKey("broadcasts.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    read_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    broadcast = relationship("Broadcast", backref="read_receipts")
    user = relationship("User", backref="read_broadcasts")
