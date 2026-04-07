from sqlalchemy import Column, Integer, DateTime, func, ForeignKey, Text
from sqlalchemy.orm import relationship

from database import Base


class TaskMessage(Base):
    __tablename__ = "task_messages"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False, index=True)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    message = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    task = relationship("Task", backref="messages")
    sender = relationship("User", backref="task_messages")
