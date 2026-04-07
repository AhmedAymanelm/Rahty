from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel, Field
from typing import List, Optional


class ShiftReportCreate(BaseModel):
    shift_date: Optional[date] = None
    shift_type: str
    network_revenue: Decimal = Field(default=Decimal("0"), ge=0)
    cash_revenue: Decimal = Field(default=Decimal("0"), ge=0)
    rooms_sold: int = Field(default=0, ge=0)
    pricing_notes: Optional[str] = None
    notes: Optional[str] = None
    photo_url: Optional[str] = None
    hotel_id: Optional[int] = None


class ShiftReportReviewRequest(BaseModel):
    status: str
    review_note: Optional[str] = None


class ShiftReportUpdate(BaseModel):
    shift_date: Optional[date] = None
    shift_type: Optional[str] = None
    network_revenue: Optional[Decimal] = Field(default=None, ge=0)
    cash_revenue: Optional[Decimal] = Field(default=None, ge=0)
    rooms_sold: Optional[int] = Field(default=None, ge=0)
    pricing_notes: Optional[str] = None
    notes: Optional[str] = None
    photo_url: Optional[str] = None


class ShiftReportOut(BaseModel):
    id: int
    hotel_id: int
    reporter_id: int
    shift_date: date
    shift_type: str
    network_revenue: Decimal
    cash_revenue: Decimal
    rooms_sold: int
    pricing_notes: Optional[str]
    notes: Optional[str]
    photo_url: Optional[str]
    status: str
    review_note: Optional[str]
    reviewed_by_id: Optional[int]
    submitted_at: datetime
    reviewed_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ExpenseCreate(BaseModel):
    category: str
    amount: Decimal = Field(ge=0)
    description: str = Field(min_length=2)
    expense_date: Optional[date] = None
    hotel_id: Optional[int] = None
    maintenance_report_id: Optional[int] = None


class ExpenseOut(BaseModel):
    id: int
    hotel_id: int
    created_by_id: int
    category: str
    amount: Decimal
    description: str
    expense_date: date
    maintenance_report_id: Optional[int]
    created_at: datetime

    class Config:
        from_attributes = True


class RevenueByHotelOut(BaseModel):
    hotel_id: int
    hotel_name: str
    revenue: Decimal


class RevenueByDayOut(BaseModel):
    day: date
    revenue: Decimal


class RevenueByShiftOut(BaseModel):
    shift_type: str
    revenue: Decimal


class RevenueSummaryOut(BaseModel):
    total_revenue: Decimal
    by_hotel: List[RevenueByHotelOut]
    by_day: List[RevenueByDayOut]
    by_shift: List[RevenueByShiftOut]


class FinancialDailyComparisonOut(BaseModel):
    day: date
    revenue: Decimal
    expenses: Decimal
    profit: Decimal


class HotelAmountOut(BaseModel):
    hotel_id: int
    hotel_name: str
    amount: Decimal


class FaultCostOut(BaseModel):
    fault_type: str
    amount: Decimal


class FinancialDashboardOut(BaseModel):
    total_revenue: Decimal
    total_expenses: Decimal
    net_profit: Decimal
    highest_revenue_hotel: Optional[HotelAmountOut] = None
    lowest_profit_hotel: Optional[HotelAmountOut] = None
    most_expensive_hotel: Optional[HotelAmountOut] = None
    most_expensive_fault_type: Optional[FaultCostOut] = None
    daily_comparison: List[FinancialDailyComparisonOut]


class CompetitorPriceCreate(BaseModel):
    competitor_name: str = Field(min_length=2, max_length=200)
    room_type: str = Field(min_length=2, max_length=80)
    price: Decimal = Field(ge=0)
    note: Optional[str] = None
    hotel_id: Optional[int] = None


class CompetitorPriceOut(BaseModel):
    id: int
    hotel_id: int
    created_by_id: int
    competitor_name: str
    room_type: str
    price: Decimal
    note: Optional[str]
    captured_at: datetime

    class Config:
        from_attributes = True


class OurPriceUpdate(BaseModel):
    room_type: str = Field(min_length=2, max_length=80)
    price: Decimal = Field(ge=0)
    hotel_id: Optional[int] = None


class OurPriceOut(BaseModel):
    hotel_id: int
    room_type: str
    price: Decimal
    updated_by_id: Optional[int] = None
    updated_at: Optional[datetime] = None


class AdminReportsFinancialCardsOut(BaseModel):
    today_revenue: Decimal
    today_expenses: Decimal
    today_profit: Decimal


class AdminReportsShiftRowOut(BaseModel):
    hotel_name: str
    shift_type: str
    reporter_name: str
    network_revenue: Decimal
    cash_revenue: Decimal
    rooms_sold: int
    status: str
    shift_date: date


class AdminReportsStaffPerformanceOut(BaseModel):
    user_id: int
    full_name: str
    hotel_name: str
    role: str
    tasks_total: int
    tasks_completed: int
    completion_rate: int
    quality_score: int
    discipline_score: int
    overall_score: int


class AdminReportsRoomsOut(BaseModel):
    total: int
    ready: int
    cleaning: int
    maintenance: int
    dirty: int
    occupied: int


class AdminReportsWarehouseItemOut(BaseModel):
    id: int
    item_name: str
    quantity: int
    reorder_level: int
    status: str
    unit: str


class WarehouseItemCreate(BaseModel):
    item_name: str = Field(min_length=2, max_length=200)
    quantity: int = Field(ge=0)
    reorder_level: int = Field(ge=0)
    unit: str = Field(min_length=1, max_length=50)


class WarehouseItemUpdate(BaseModel):
    item_name: Optional[str] = Field(default=None, min_length=2, max_length=200)
    quantity: Optional[int] = Field(default=None, ge=0)
    reorder_level: Optional[int] = Field(default=None, ge=0)
    unit: Optional[str] = Field(default=None, min_length=1, max_length=50)
    is_active: Optional[bool] = None


class WarehouseItemConsumeRequest(BaseModel):
    quantity: int = Field(gt=0)
    note: Optional[str] = None


class WarehouseItemOut(BaseModel):
    id: int
    item_name: str
    quantity: int
    reorder_level: int
    unit: str
    is_active: bool
    updated_by_id: Optional[int]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AdminReportsOverviewOut(BaseModel):
    financial_cards: AdminReportsFinancialCardsOut
    recent_shift_reports: List[AdminReportsShiftRowOut]
    staff_performance: List[AdminReportsStaffPerformanceOut]
    rooms: AdminReportsRoomsOut
    warehouse_items: List[AdminReportsWarehouseItemOut]


class IncomeEmployeeRowOut(BaseModel):
    user_id: int
    full_name: str
    hotel_name: str
    reports_count: int
    total_revenue: Decimal


class IncomeSummaryOut(BaseModel):
    from_date: date
    to_date: date
    total_revenue: Decimal
    by_employee: List[IncomeEmployeeRowOut]


class IncomeTotalsOut(BaseModel):
    today: Decimal
    week: Decimal
    month: Decimal
    year: Decimal


class IncomeDashboardOut(BaseModel):
    totals: IncomeTotalsOut
    selected_range: IncomeSummaryOut


class PurchaseOrderCreate(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    description: str = Field(min_length=2)
    amount: Decimal = Field(ge=0)
    request_date: Optional[date] = None
    hotel_id: Optional[int] = None


class PurchaseOrderReviewRequest(BaseModel):
    status: str
    review_note: Optional[str] = None


class PurchaseOrderOut(BaseModel):
    id: int
    hotel_id: int
    hotel_name: str
    requester_id: int
    requester_name: str
    title: str
    description: str
    amount: Decimal
    request_date: date
    status: str
    review_note: Optional[str]
    reviewed_by_id: Optional[int]
    reviewed_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class WarehouseRequestCreate(BaseModel):
    item_id: int
    quantity_requested: int = Field(gt=0)
    note: Optional[str] = None
    hotel_id: Optional[int] = None


class WarehouseRequestReviewRequest(BaseModel):
    status: str
    quantity_approved: Optional[int] = Field(default=None, gt=0)
    review_note: Optional[str] = None


class WarehouseRequestOut(BaseModel):
    id: int
    hotel_id: int
    hotel_name: str
    item_id: int
    item_name: str
    requester_id: int
    requester_name: str
    quantity_requested: int
    quantity_approved: Optional[int]
    unit: str
    note: Optional[str]
    status: str
    review_note: Optional[str]
    reviewed_by_id: Optional[int]
    reviewed_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime


class ExpenseReportOut(BaseModel):
    total_count: int
    total_amount: Decimal
    pending_count: int
    approved_count: int
    rejected_count: int
