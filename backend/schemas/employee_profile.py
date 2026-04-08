from pydantic import BaseModel
from typing import Optional
from datetime import datetime, date


class WarningOut(BaseModel):
    id: int
    warning_type: str
    reason: str
    notes: Optional[str] = None
    issued_by_name: str
    created_at: datetime


class LeaveRequestOut(BaseModel):
    id: int
    leave_type: str
    start_date: date
    end_date: date
    reason: Optional[str] = None
    status: str
    reviewed_by_name: Optional[str] = None
    review_notes: Optional[str] = None
    created_at: datetime


class GlobalWarningOut(WarningOut):
    user_id: int
    user_name: str
    hotel_name: Optional[str] = None


class GlobalLeaveOut(LeaveRequestOut):
    user_id: int
    user_name: str
    hotel_name: Optional[str] = None

class DirectMessageCreate(BaseModel):
    message: str


class DirectMessageOut(BaseModel):
    id: int
    sender_id: int
    receiver_id: int
    message: str
    is_read: bool
    created_at: datetime
    sender_name: str
    
    class Config:
        from_attributes = True


class ProfileTaskOut(BaseModel):
    id: int
    title: str
    priority: str
    status: str
    hotel_name: Optional[str] = None
    creator_name: Optional[str] = None
    due_date: Optional[datetime] = None
    created_at: datetime


class ProfileConversationOut(BaseModel):
    task_id: int
    task_title: str
    last_message: str
    last_message_at: datetime
    message_count: int


class PerformanceMetrics(BaseModel):
    total_tasks: int = 0
    completed_tasks: int = 0
    pending_tasks: int = 0
    in_progress_tasks: int = 0
    completion_rate: float = 0.0
    total_warnings: int = 0
    total_leaves: int = 0
    approved_leaves: int = 0
    attendance_days: int = 0


class EmployeeProfileOut(BaseModel):
    # Basic Info
    id: int
    username: str
    full_name: str
    role: str
    hotel_id: Optional[int] = None
    hotel_name: Optional[str] = None
    is_active: bool = True
    created_at: Optional[datetime] = None

    # Detailed fields
    national_id: Optional[str] = None
    phone_number: Optional[str] = None
    email: Optional[str] = None
    hiring_date: Optional[date] = None
    contract_type: Optional[str] = None
    basic_salary: Optional[float] = None

    # Aggregated Data
    tasks: list[ProfileTaskOut] = []
    conversations: list[ProfileConversationOut] = []
    warnings: list[WarningOut] = []
    leaves: list[LeaveRequestOut] = []
    performance: PerformanceMetrics = PerformanceMetrics()
