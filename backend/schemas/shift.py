from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional

class ShiftBase(BaseModel):
    name: str
    start_time: str # "HH:MM" 24h
    end_time: str   # "HH:MM" 24h
    roles: Optional[str] = "all" # "all" or specific role keys
    is_active: bool = True

class ShiftCreate(ShiftBase):
    pass

class ShiftUpdate(BaseModel):
    name: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    roles: Optional[str] = None
    is_active: Optional[bool] = None

class ShiftOut(ShiftBase):
    id: int
    created_at: datetime
    
    class Config:
        from_attributes = True
