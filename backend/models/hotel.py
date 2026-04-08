from sqlalchemy import Column, Integer, String, DateTime, Text, func, Float, ForeignKey
from sqlalchemy.orm import relationship
from database import Base

class Hotel(Base):
    __tablename__ = "hotels"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    location = Column(String(200), nullable=True)
    city = Column(String(100), nullable=True)
    address = Column(String(300), nullable=True)
    phone = Column(String(30), nullable=True)
    total_rooms = Column(Integer, default=0)
    total_floors = Column(Integer, default=0)
    stars = Column(Integer, default=3)
    description = Column(Text, nullable=True)
    manager_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    users = relationship("User", back_populates="hotel", foreign_keys="User.hotel_id")
    manager = relationship("User", foreign_keys=[manager_id])

