from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional

class ChecklistItemBase(BaseModel):
    category: str
    label: str
    is_active: bool = True

class ChecklistItemCreate(ChecklistItemBase):
    pass

class ChecklistItemUpdate(BaseModel):
    category: Optional[str] = None
    label: Optional[str] = None
    is_active: Optional[bool] = None

class ChecklistItemOut(ChecklistItemBase):
    id: int
    created_at: datetime
    
    class Config:
        from_attributes = True
