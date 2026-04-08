from sqlalchemy import Column, Integer, String, Boolean, func, DateTime
from database import Base

class ChecklistItem(Base):
    __tablename__ = "checklist_items"

    id = Column(Integer, primary_key=True, index=True)
    category = Column(String(100), nullable=False) # e.g. 'الحمام', 'الأثاث'
    label = Column(String(200), nullable=False)    # e.g. 'الأرضية نظيفة'
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
