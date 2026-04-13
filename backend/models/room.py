import enum
from sqlalchemy import Column, Integer, String, Enum, ForeignKey, DateTime, func
from sqlalchemy.orm import relationship
from database import Base


class RoomStatus(str, enum.Enum):
    ready = "ready"
    dirty = "dirty"
    cleaning = "cleaning"
    maintenance = "maintenance"
    occupied = "occupied"


class Room(Base):
    __tablename__ = "rooms"

    id = Column(Integer, primary_key=True, index=True)
    number = Column(String(10), nullable=False)
    floor = Column(Integer, default=1)
    room_type = Column(String(50), default="Single")
    status = Column(Enum(RoomStatus), default=RoomStatus.ready)
    
    hotel_id = Column(Integer, ForeignKey("hotels.id"), nullable=False)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    hotel = relationship("Hotel", backref="rooms")
