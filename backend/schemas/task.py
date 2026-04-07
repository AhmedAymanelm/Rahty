from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from .auth import UserOut, HotelOut

class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    priority: str = "normal"
    assigned_to_id: Optional[int] = None
    due_date: Optional[datetime] = None
    # hotel_id is inherited from the creator automatically or specified
    hotel_id: Optional[int] = None

class TaskStatusUpdate(BaseModel):
    status: str

class TaskOut(BaseModel):
    id: int
    title: str
    description: Optional[str]
    priority: str
    status: str
    hotel_id: int
    creator_id: int
    assigned_to_id: Optional[int]
    due_date: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    
    # Nested info
    creator: Optional[UserOut] = None
    assigned_to: Optional[UserOut] = None
    hotel: Optional[HotelOut] = None

    class Config:
        from_attributes = True


class TaskMessageCreate(BaseModel):
    message: str


class TaskMessageOut(BaseModel):
    id: int
    task_id: int
    sender_id: int
    sender_full_name: str
    message: str
    created_at: datetime
