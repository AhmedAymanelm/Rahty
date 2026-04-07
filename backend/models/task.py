import enum
from sqlalchemy import Column, Integer, String, Enum, DateTime, func, ForeignKey, Text
from sqlalchemy.orm import relationship
from database import Base


class TaskPriority(str, enum.Enum):
    urgent = "urgent"
    high = "high"
    normal = "normal"
    low = "low"


class TaskStatus(str, enum.Enum):
    pending = "pending"
    in_progress = "in_progress"
    completed = "completed"
    closed = "closed"


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    priority = Column(Enum(TaskPriority), default=TaskPriority.normal)
    status = Column(Enum(TaskStatus), default=TaskStatus.pending)
    
    hotel_id = Column(Integer, ForeignKey("hotels.id"), nullable=False)
    creator_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    assigned_to_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    due_date = Column(DateTime(timezone=True), nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    hotel = relationship("Hotel", backref="tasks")
    creator = relationship("User", foreign_keys=[creator_id], backref="created_tasks")
    assigned_to = relationship("User", foreign_keys=[assigned_to_id], backref="assigned_tasks")
