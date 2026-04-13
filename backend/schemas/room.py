from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class RoomBase(BaseModel):
    number: str
    floor: int = 1
    room_type: str = "Single"
    status: str = "ready"
    hotel_id: int

class RoomCreate(RoomBase):
    pass

class RoomStatusUpdate(BaseModel):
    status: str

class RoomOut(RoomBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
