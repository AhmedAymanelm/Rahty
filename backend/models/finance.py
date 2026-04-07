import enum
from sqlalchemy import Column, Integer, String, Enum, DateTime, func, ForeignKey, Text, Numeric, Date, UniqueConstraint
from sqlalchemy.orm import relationship
from database import Base


class ShiftType(str, enum.Enum):
    morning = "morning"
    evening = "evening"
    night = "night"


class ReportStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class ExpenseCategory(str, enum.Enum):
    maintenance = "maintenance"
    parts = "parts"
    daily = "daily"
    purchase = "purchase"
    other = "other"


class PurchaseOrderStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class WarehouseRequestStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class ShiftReport(Base):
    __tablename__ = "shift_reports"

    id = Column(Integer, primary_key=True, index=True)
    hotel_id = Column(Integer, ForeignKey("hotels.id"), nullable=False, index=True)
    reporter_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    shift_date = Column(Date, nullable=False, index=True)
    shift_type = Column(Enum(ShiftType), nullable=False)

    network_revenue = Column(Numeric(12, 2), nullable=False, default=0)
    cash_revenue = Column(Numeric(12, 2), nullable=False, default=0)
    rooms_sold = Column(Integer, nullable=False, default=0)

    pricing_notes = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    photo_url = Column(Text, nullable=True)

    status = Column(Enum(ReportStatus), nullable=False, default=ReportStatus.pending, index=True)
    review_note = Column(Text, nullable=True)

    reviewed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    submitted_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    hotel = relationship("Hotel", backref="shift_reports")
    reporter = relationship("User", foreign_keys=[reporter_id], backref="reported_shifts")
    reviewed_by = relationship("User", foreign_keys=[reviewed_by_id], backref="reviewed_shifts")


class Expense(Base):
    __tablename__ = "expenses"

    id = Column(Integer, primary_key=True, index=True)
    hotel_id = Column(Integer, ForeignKey("hotels.id"), nullable=False, index=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    category = Column(Enum(ExpenseCategory), nullable=False, index=True)
    amount = Column(Numeric(12, 2), nullable=False)
    description = Column(Text, nullable=False)
    expense_date = Column(Date, nullable=False, index=True)

    maintenance_report_id = Column(Integer, ForeignKey("maintenance_reports.id"), nullable=True, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    hotel = relationship("Hotel", backref="expenses")
    created_by = relationship("User", backref="created_expenses")
    maintenance_report = relationship("MaintenanceReport", backref="expenses")


class FinanceAuditLog(Base):
    __tablename__ = "finance_audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    entity_type = Column(String(60), nullable=False, index=True)
    entity_id = Column(Integer, nullable=False, index=True)
    action = Column(String(60), nullable=False, index=True)

    actor_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    hotel_id = Column(Integer, ForeignKey("hotels.id"), nullable=True, index=True)

    payload = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    actor = relationship("User", backref="finance_audit_logs")
    hotel = relationship("Hotel", backref="finance_audit_logs")


class CompetitorPrice(Base):
    __tablename__ = "competitor_prices"

    id = Column(Integer, primary_key=True, index=True)
    hotel_id = Column(Integer, ForeignKey("hotels.id"), nullable=False, index=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    competitor_name = Column(String(200), nullable=False)
    room_type = Column(String(80), nullable=False, default="غرفة عادية")
    price = Column(Numeric(12, 2), nullable=False)
    note = Column(Text, nullable=True)

    captured_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    hotel = relationship("Hotel", backref="competitor_prices")
    created_by = relationship("User", backref="competitor_prices")


class OurPriceSetting(Base):
    __tablename__ = "our_price_settings"
    __table_args__ = (UniqueConstraint("hotel_id", "room_type", name="uq_our_price_hotel_room_type"),)

    id = Column(Integer, primary_key=True, index=True)
    hotel_id = Column(Integer, ForeignKey("hotels.id"), nullable=False, index=True)
    room_type = Column(String(80), nullable=False, default="غرفة عادية")
    price = Column(Numeric(12, 2), nullable=False)
    updated_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    hotel = relationship("Hotel", backref="our_price_settings")
    updated_by = relationship("User", backref="our_price_settings")


class WarehouseItem(Base):
    __tablename__ = "warehouse_items"

    id = Column(Integer, primary_key=True, index=True)
    item_name = Column(String(200), nullable=False, unique=True)
    quantity = Column(Integer, nullable=False, default=0)
    reorder_level = Column(Integer, nullable=False, default=0)
    unit = Column(String(50), nullable=False, default="قطعة")
    is_active = Column(Integer, nullable=False, default=1)

    updated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    updated_by = relationship("User", backref="warehouse_items")


class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"

    id = Column(Integer, primary_key=True, index=True)
    hotel_id = Column(Integer, ForeignKey("hotels.id"), nullable=False, index=True)
    requester_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    request_date = Column(Date, nullable=False, index=True)
    status = Column(Enum(PurchaseOrderStatus), nullable=False, default=PurchaseOrderStatus.pending, index=True)
    review_note = Column(Text, nullable=True)
    reviewed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    hotel = relationship("Hotel", backref="purchase_orders")
    requester = relationship("User", foreign_keys=[requester_id], backref="purchase_orders")
    reviewed_by = relationship("User", foreign_keys=[reviewed_by_id], backref="reviewed_purchase_orders")


class WarehouseRequest(Base):
    __tablename__ = "warehouse_requests"

    id = Column(Integer, primary_key=True, index=True)
    hotel_id = Column(Integer, ForeignKey("hotels.id"), nullable=False, index=True)
    item_id = Column(Integer, ForeignKey("warehouse_items.id"), nullable=False, index=True)
    requester_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    quantity_requested = Column(Integer, nullable=False)
    quantity_approved = Column(Integer, nullable=True)
    note = Column(Text, nullable=True)
    status = Column(Enum(WarehouseRequestStatus), nullable=False, default=WarehouseRequestStatus.pending, index=True)
    review_note = Column(Text, nullable=True)
    reviewed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    hotel = relationship("Hotel", backref="warehouse_requests")
    item = relationship("WarehouseItem", backref="warehouse_requests")
    requester = relationship("User", foreign_keys=[requester_id], backref="warehouse_requests")
    reviewed_by = relationship("User", foreign_keys=[reviewed_by_id], backref="reviewed_warehouse_requests")
