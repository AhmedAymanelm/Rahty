from datetime import datetime
from pydantic import BaseModel, Field
from typing import Optional


class BroadcastCreate(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    message: str = Field(min_length=2)
    target_role: str = "all"
    hotel_id: Optional[int] = None


class BroadcastOut(BaseModel):
    id: int
    title: str
    message: str
    target_role: str
    hotel_id: Optional[int]
    hotel_name: Optional[str] = None
    creator_id: int
    created_at: datetime

    class Config:
        from_attributes = True


class BroadcastListOut(BroadcastOut):
    read_count: int = 0
    recipients_count: int = 0


class BroadcastInboxOut(BroadcastOut):
    is_read: bool = False
