from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class RoomTypeBase(BaseModel):
    name: str
    base_price: float = 0.0
    capacity: int = 2
    area: float = 0.0
    is_active: bool = True

class RoomTypeCreate(RoomTypeBase):
    pass

class RoomTypeUpdate(BaseModel):
    name: Optional[str] = None
    base_price: Optional[float] = None
    capacity: Optional[int] = None
    area: Optional[float] = None
    is_active: Optional[bool] = None

class RoomTypeOut(RoomTypeBase):
    id: int
    hotel_id: int
    hotel_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
