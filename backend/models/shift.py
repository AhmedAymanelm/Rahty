from sqlalchemy import Column, Integer, String, Time, Boolean, func, DateTime
from database import Base

class Shift(Base):
    __tablename__ = "shifts"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False) # صباحية، مسائية، ليلية
    start_time = Column(String(5), nullable=False) # stored as "HH:MM"
    end_time = Column(String(5), nullable=False)   # stored as "HH:MM"
    roles = Column(String(200), nullable=True)     # "all" or "supervisor,cleaner,..."
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
