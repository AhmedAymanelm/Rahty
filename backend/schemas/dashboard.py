from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime


class DashboardCountOut(BaseModel):
    total: int
    open: int
    waiting_parts: int
    completed: int
    verified: int


class TechnicianPerformanceOut(BaseModel):
    user_id: int
    full_name: str
    avg_repair_minutes: float
    resolved_reports: int


class HotelPerformanceOut(BaseModel):
    hotel_id: int
    hotel_name: str
    avg_repair_minutes: float
    resolved_reports: int


class RoomUptimeOut(BaseModel):
    hotel_id: Optional[int] = None
    hotel_name: Optional[str] = None
    total_rooms: int
    ready_rooms: int
    uptime_percent: float


class DashboardOverviewOut(BaseModel):
    faults: DashboardCountOut
    fastest_technician: Optional[TechnicianPerformanceOut] = None
    slowest_hotel: Optional[HotelPerformanceOut] = None
    rooms_uptime: RoomUptimeOut
    hotels_uptime: List[RoomUptimeOut]


class AttendanceRowOut(BaseModel):
    user_id: int
    full_name: str
    role: str
    check_in_at: Optional[datetime] = None
    check_out_at: Optional[datetime] = None
    location_status: str
    status: str
    late_minutes: int = 0
    early_checkout_minutes: int = 0
    warning_text: Optional[str] = None
