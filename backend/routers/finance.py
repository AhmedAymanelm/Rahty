import json
from collections import defaultdict
from datetime import date, timedelta, datetime, timezone
from decimal import Decimal
from io import BytesIO
from math import radians, sin, cos, asin, sqrt
from pathlib import Path
from typing import Dict, List, Optional
from urllib.parse import urlparse, unquote
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Request
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from middleware.auth import check_hotel_access, get_current_user, require_role
from models.finance import (
    CompetitorPrice,
    Expense,
    ExpenseCategory,
    FinanceAuditLog,
    OurPriceSetting,
    PurchaseOrder,
    PurchaseOrderStatus,
    ReportStatus,
    ShiftReport,
    ShiftType,
    WarehouseItem,
    WarehouseRequest,
    WarehouseRequestStatus,
)
from models.attendance import AttendanceSession
from models.hotel import Hotel
from models.maintenance import MaintenanceReport
from models.room import Room, RoomStatus
from models.task import Task, TaskStatus
from models.user import User
from schemas.finance import (
    AdminReportsOverviewOut,
    AdminReportsRoomsOut,
    AdminReportsShiftRowOut,
    AdminReportsStaffPerformanceOut,
    AdminReportsWarehouseItemOut,
    AdminReportsFinancialCardsOut,
    CompetitorPriceCreate,
    CompetitorPriceOut,
    OurPriceOut,
    OurPriceUpdate,
    ExpenseCreate,
    ExpenseOut,
    FaultCostOut,
    FinancialDailyComparisonOut,
    FinancialDashboardOut,
    HotelAmountOut,
    RevenueByDayOut,
    RevenueByHotelOut,
    RevenueByShiftOut,
    RevenueSummaryOut,
    IncomeDashboardOut,
    IncomeEmployeeRowOut,
    IncomeSummaryOut,
    IncomeTotalsOut,
    ExpenseReportOut,
    PurchaseOrderCreate,
    PurchaseOrderOut,
    PurchaseOrderReviewRequest,
    ShiftReportCreate,
    ShiftReportOut,
    ShiftReportReviewRequest,
    ShiftReportUpdate,
    WarehouseRequestCreate,
    WarehouseRequestOut,
    WarehouseRequestReviewRequest,
    WarehouseItemConsumeRequest,
    WarehouseItemCreate,
    WarehouseItemOut,
    WarehouseItemUpdate,
)

router = APIRouter(prefix="/api/finance", tags=["Finance"])
SHIFT_REPORT_EDIT_WINDOW_MINUTES = 15
DEFAULT_OUR_ROOM_PRICE = Decimal("450")
SHIFT_UPLOAD_DIR = Path(__file__).resolve().parents[1] / "uploads" / "shift-reports"
SHIFT_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
ATTENDANCE_RADIUS_METERS = 220
ATTENDANCE_STALE_MINUTES = 12


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _as_decimal(value: Decimal | int | float | None) -> Decimal:
    if value is None:
        return Decimal("0")
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def _audit(
    db: Session,
    *,
    entity_type: str,
    entity_id: int,
    action: str,
    actor_id: int,
    hotel_id: Optional[int],
    payload: Optional[dict] = None,
) -> None:
    row = FinanceAuditLog(
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        actor_id=actor_id,
        hotel_id=hotel_id,
        payload=json.dumps(payload, ensure_ascii=False) if payload else None,
    )
    db.add(row)


def _fault_type(report: MaintenanceReport) -> str:
    title = (report.title or "").strip()
    if ":" in title:
        return title.split(":", 1)[1].strip() or "unknown"
    return title or "unknown"


def _utc_or_assume(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _str_if_decimal(v):
    return str(v) if isinstance(v, Decimal) else v


def _percent(part: int, total: int) -> int:
    if total <= 0:
        return 0
    return int(round((part / total) * 100))


def _warehouse_status(quantity: int, reorder_level: int) -> str:
    if quantity <= reorder_level:
        return "critical"
    if quantity <= int(reorder_level * 1.2):
        return "low"
    return "ok"


def _income_range_dates(range_key: str) -> tuple[date, date]:
    today = date.today()
    if range_key == "today":
        return today, today
    if range_key == "week":
        return today - timedelta(days=today.weekday()), today
    if range_key == "month":
        return today.replace(day=1), today
    if range_key == "year":
        return date(today.year, 1, 1), today
    raise HTTPException(status_code=400, detail="range يجب أن يكون today أو week أو month أو year")


def _warehouse_request_out(row: WarehouseRequest, user_map: dict[int, str], hotel_map: dict[int, str]) -> WarehouseRequestOut:
    return WarehouseRequestOut(
        id=row.id,
        hotel_id=row.hotel_id,
        hotel_name=hotel_map.get(row.hotel_id, f"Hotel {row.hotel_id}"),
        item_id=row.item_id,
        item_name=row.item.item_name if row.item else f"Item {row.item_id}",
        requester_id=row.requester_id,
        requester_name=user_map.get(row.requester_id, f"User {row.requester_id}"),
        quantity_requested=int(row.quantity_requested or 0),
        quantity_approved=int(row.quantity_approved) if row.quantity_approved is not None else None,
        unit=(row.item.unit if row.item and row.item.unit else "قطعة"),
        note=row.note,
        status=row.status.value if hasattr(row.status, "value") else str(row.status),
        review_note=row.review_note,
        reviewed_by_id=row.reviewed_by_id,
        reviewed_at=row.reviewed_at,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _purchase_order_out(row: PurchaseOrder, user_map: dict[int, str], hotel_map: dict[int, str]) -> PurchaseOrderOut:
    return PurchaseOrderOut(
        id=row.id,
        hotel_id=row.hotel_id,
        hotel_name=hotel_map.get(row.hotel_id, f"Hotel {row.hotel_id}"),
        requester_id=row.requester_id,
        requester_name=user_map.get(row.requester_id, f"User {row.requester_id}"),
        title=row.title,
        description=row.description,
        amount=_as_decimal(row.amount),
        request_date=row.request_date,
        status=row.status.value if hasattr(row.status, "value") else str(row.status),
        review_note=row.review_note,
        reviewed_by_id=row.reviewed_by_id,
        reviewed_at=row.reviewed_at,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000.0
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    c = 2 * asin(sqrt(a))
    return r * c


def _enforce_attendance_before_shift_submit(db: Session, current_user: User, hotel_id: int) -> None:
    role = current_user.role.value if hasattr(current_user.role, "value") else current_user.role
    if role == "admin":
        return

    session = (
        db.query(AttendanceSession)
        .filter(AttendanceSession.user_id == current_user.id, AttendanceSession.session_date == date.today())
        .order_by(AttendanceSession.id.desc())
        .first()
    )
    if not session:
        raise HTTPException(status_code=400, detail="لا يمكن إرسال التقرير قبل تسجيل الحضور")

    if session.hotel_id != hotel_id:
        raise HTTPException(status_code=403, detail="جلسة الحضور الحالية لا تتبع هذا الفندق")

    if session.checked_out_at is not None:
        raise HTTPException(status_code=400, detail="تم تسجيل الانصراف اليوم")

    now_utc = _now_utc()
    if not session.last_ping_at or (now_utc - session.last_ping_at) > timedelta(minutes=ATTENDANCE_STALE_MINUTES):
        raise HTTPException(status_code=400, detail="تعذر التحقق من تواجدك الحالي داخل الفندق")

    if session.last_ping_lat is None or session.last_ping_lng is None:
        raise HTTPException(status_code=400, detail="بيانات الموقع غير مكتملة")

    distance = _haversine_meters(
        float(session.check_in_lat),
        float(session.check_in_lng),
        float(session.last_ping_lat),
        float(session.last_ping_lng),
    )
    if distance > ATTENDANCE_RADIUS_METERS or session.out_of_range_since is not None:
        raise HTTPException(status_code=403, detail="لا يمكن الإرسال أثناء التواجد خارج نطاق الدوام")


def _is_local_shift_photo_url(photo_url: str) -> bool:
    parsed = urlparse(photo_url)
    return "/uploads/shift-reports/" in (parsed.path or "")


def _extract_local_shift_upload_path(photo_url: Optional[str]) -> Optional[Path]:
    if not photo_url:
        return None

    parsed = urlparse(photo_url)
    raw_path = unquote(parsed.path)
    marker = "/uploads/shift-reports/"
    if marker not in raw_path:
        return None

    filename = raw_path.split(marker, 1)[1].strip()
    if not filename:
        return None

    filename = Path(filename).name
    candidate = (SHIFT_UPLOAD_DIR / filename).resolve()
    try:
        candidate.relative_to(SHIFT_UPLOAD_DIR.resolve())
    except ValueError:
        return None
    return candidate


def _safe_delete_local_shift_photo(photo_url: Optional[str]) -> None:
    path = _extract_local_shift_upload_path(photo_url)
    if not path:
        return

    try:
        if path.exists() and path.is_file():
            path.unlink()
    except OSError:
        return


@router.post("/shift-reports/upload-photo")
async def upload_shift_report_photo(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(require_role("admin", "supervisor", "superfv", "reception")),
):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="يجب رفع ملف صورة صالح")

    suffix = Path(file.filename or "").suffix.lower()
    allowed = {".jpg", ".jpeg", ".png", ".webp"}
    if suffix not in allowed:
        ext_map = {
            "image/jpeg": ".jpg",
            "image/png": ".png",
            "image/webp": ".webp",
        }
        suffix = ext_map.get(file.content_type, "")

    if suffix not in allowed:
        raise HTTPException(status_code=400, detail="امتداد الصورة غير مدعوم")

    raw_content = await file.read()
    if not raw_content:
        raise HTTPException(status_code=400, detail="الملف فارغ")

    max_size_bytes = 8 * 1024 * 1024
    if len(raw_content) > max_size_bytes:
        raise HTTPException(status_code=400, detail="حجم الصورة يجب أن يكون أقل من 8MB")

    try:
        image = Image.open(BytesIO(raw_content))
        image = ImageOps.exif_transpose(image)
    except UnidentifiedImageError:
        raise HTTPException(status_code=400, detail="تعذر قراءة الصورة")

    image.thumbnail((1920, 1920), Image.Resampling.LANCZOS)

    has_alpha = image.mode in ("RGBA", "LA") or (image.mode == "P" and "transparency" in image.info)
    if has_alpha:
        target_format = "PNG"
        suffix = ".png"
        save_kwargs = {"optimize": True}
    else:
        target_format = "JPEG"
        suffix = ".jpg"
        if image.mode not in ("RGB", "L"):
            image = image.convert("RGB")
        save_kwargs = {"optimize": True, "quality": 82, "progressive": True}

    out = BytesIO()
    image.save(out, format=target_format, **save_kwargs)

    filename = f"{uuid4().hex}{suffix}"
    file_path = SHIFT_UPLOAD_DIR / filename
    file_path.write_bytes(out.getvalue())

    public_url = f"{request.base_url}uploads/shift-reports/{filename}"
    return {"url": public_url}


@router.post("/competitor-prices", response_model=CompetitorPriceOut)
def create_competitor_price(
    req: CompetitorPriceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "supervisor", "superfv", "reception")),
):
    role = current_user.role.value if hasattr(current_user.role, "value") else current_user.role

    hotel_id = current_user.hotel_id
    if role == "admin":
        if not req.hotel_id:
            raise HTTPException(status_code=400, detail="يجب تحديد الفندق")
        hotel_id = req.hotel_id
    elif req.hotel_id and req.hotel_id != current_user.hotel_id:
        raise HTTPException(status_code=403, detail="لا تملك صلاحية الإضافة لفندق آخر")

    competitor_name = req.competitor_name.strip()
    room_type = req.room_type.strip()

    existing = (
        db.query(CompetitorPrice)
        .filter(
            CompetitorPrice.hotel_id == hotel_id,
            func.lower(func.trim(CompetitorPrice.competitor_name)) == competitor_name.lower(),
            func.trim(CompetitorPrice.room_type) == room_type,
        )
        .first()
    )

    action = "created"
    old_price = None
    if existing:
        action = "updated"
        old_price = existing.price
        existing.created_by_id = current_user.id
        existing.competitor_name = competitor_name
        existing.room_type = room_type
        existing.price = req.price
        existing.note = req.note
        existing.captured_at = _now_utc()
        row = existing
    else:
        row = CompetitorPrice(
            hotel_id=hotel_id,
            created_by_id=current_user.id,
            competitor_name=competitor_name,
            room_type=room_type,
            price=req.price,
            note=req.note,
        )
        db.add(row)
        db.flush()

    _audit(
        db,
        entity_type="competitor_price",
        entity_id=row.id,
        action=action,
        actor_id=current_user.id,
        hotel_id=hotel_id,
        payload={
            "competitor_name": competitor_name,
            "room_type": room_type,
            "old_price": str(old_price) if old_price is not None else None,
            "price": str(req.price),
        },
    )

    db.commit()
    db.refresh(row)
    return CompetitorPriceOut.model_validate(row)


@router.get("/our-price", response_model=OurPriceOut)
def get_our_price(
    room_type: str = "غرفة عادية",
    hotel_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role = current_user.role.value if hasattr(current_user.role, "value") else current_user.role

    target_hotel_id = current_user.hotel_id
    if role == "admin":
        target_hotel_id = hotel_id or current_user.hotel_id
        if target_hotel_id is None:
            first_hotel = db.query(Hotel).order_by(Hotel.id.asc()).first()
            if not first_hotel:
                raise HTTPException(status_code=404, detail="لا توجد فنادق في النظام")
            target_hotel_id = first_hotel.id
    elif hotel_id and hotel_id != current_user.hotel_id:
        raise HTTPException(status_code=403, detail="لا تملك صلاحية عرض سعر فندق آخر")

    row = (
        db.query(OurPriceSetting)
        .filter(OurPriceSetting.hotel_id == target_hotel_id, OurPriceSetting.room_type == room_type)
        .first()
    )

    if not row:
        return OurPriceOut(
            hotel_id=target_hotel_id,
            room_type=room_type,
            price=DEFAULT_OUR_ROOM_PRICE,
            updated_by_id=None,
            updated_at=None,
        )

    return OurPriceOut(
        hotel_id=row.hotel_id,
        room_type=row.room_type,
        price=row.price,
        updated_by_id=row.updated_by_id,
        updated_at=row.updated_at,
    )


@router.put("/our-price", response_model=OurPriceOut)
def set_our_price(
    req: OurPriceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "supervisor", "superfv")),
):
    role = current_user.role.value if hasattr(current_user.role, "value") else current_user.role

    target_hotel_id = current_user.hotel_id
    if role == "admin":
        target_hotel_id = req.hotel_id or current_user.hotel_id
        if target_hotel_id is None:
            raise HTTPException(status_code=400, detail="يجب تحديد الفندق")
    elif req.hotel_id and req.hotel_id != current_user.hotel_id:
        raise HTTPException(status_code=403, detail="لا تملك صلاحية تعديل سعر فندق آخر")

    room_type = req.room_type.strip()

    row = (
        db.query(OurPriceSetting)
        .filter(OurPriceSetting.hotel_id == target_hotel_id, OurPriceSetting.room_type == room_type)
        .first()
    )

    old_price = None
    if row:
        old_price = row.price
        row.price = req.price
        row.updated_by_id = current_user.id
    else:
        row = OurPriceSetting(
            hotel_id=target_hotel_id,
            room_type=room_type,
            price=req.price,
            updated_by_id=current_user.id,
        )
        db.add(row)
        db.flush()

    _audit(
        db,
        entity_type="our_price",
        entity_id=row.id,
        action="updated",
        actor_id=current_user.id,
        hotel_id=target_hotel_id,
        payload={
            "room_type": room_type,
            "old_price": str(old_price) if old_price is not None else None,
            "new_price": str(req.price),
        },
    )

    db.commit()
    db.refresh(row)

    return OurPriceOut(
        hotel_id=row.hotel_id,
        room_type=row.room_type,
        price=row.price,
        updated_by_id=row.updated_by_id,
        updated_at=row.updated_at,
    )


@router.get("/competitor-prices", response_model=List[CompetitorPriceOut])
def list_competitor_prices(
    hotel_id: Optional[int] = None,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role = current_user.role.value if hasattr(current_user.role, "value") else current_user.role

    q = db.query(CompetitorPrice)

    if role == "admin":
        if hotel_id:
            q = q.filter(CompetitorPrice.hotel_id == hotel_id)
    elif role in ["supervisor", "superfv", "reception", "accountant"]:
        q = q.filter(CompetitorPrice.hotel_id == current_user.hotel_id)
    else:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية عرض أسعار المنافسين")

    if limit < 1:
        limit = 1
    if limit > 200:
        limit = 200

    rows = q.order_by(CompetitorPrice.captured_at.desc()).limit(limit).all()
    return [CompetitorPriceOut.model_validate(r) for r in rows]


@router.post("/shift-reports", response_model=ShiftReportOut)
def create_shift_report(
    req: ShiftReportCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "supervisor", "superfv", "reception")),
):
    role = current_user.role.value if hasattr(current_user.role, "value") else current_user.role

    hotel_id = current_user.hotel_id
    if role == "admin":
        if not req.hotel_id:
            raise HTTPException(status_code=400, detail="يجب تحديد الفندق")
        hotel_id = req.hotel_id
    elif req.hotel_id and req.hotel_id != current_user.hotel_id:
        raise HTTPException(status_code=403, detail="لا تملك صلاحية الرفع لهذا الفندق")

    try:
        shift = ShiftType(req.shift_type)
    except ValueError:
        raise HTTPException(status_code=400, detail="نوع وردية غير صحيح")

    report_date = req.shift_date or date.today()

    if req.photo_url and not _is_local_shift_photo_url(req.photo_url):
        raise HTTPException(
            status_code=400,
            detail="يرجى رفع صورة التقرير من داخل النظام أولاً",
        )

    _enforce_attendance_before_shift_submit(db, current_user, hotel_id)

    report = ShiftReport(
        hotel_id=hotel_id,
        reporter_id=current_user.id,
        shift_date=report_date,
        shift_type=shift,
        network_revenue=req.network_revenue,
        cash_revenue=req.cash_revenue,
        rooms_sold=req.rooms_sold,
        pricing_notes=req.pricing_notes,
        notes=req.notes,
        photo_url=req.photo_url,
        status=ReportStatus.pending,
    )
    db.add(report)
    db.flush()

    _audit(
        db,
        entity_type="shift_report",
        entity_id=report.id,
        action="created",
        actor_id=current_user.id,
        hotel_id=hotel_id,
        payload={
            "shift_date": str(report_date),
            "shift_type": shift.value,
            "network_revenue": str(req.network_revenue),
            "cash_revenue": str(req.cash_revenue),
            "rooms_sold": req.rooms_sold,
        },
    )

    db.commit()
    db.refresh(report)
    return ShiftReportOut.model_validate(report)


@router.patch("/shift-reports/{report_id}", response_model=ShiftReportOut)
def update_shift_report(
    report_id: int,
    req: ShiftReportUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "supervisor", "superfv", "reception")),
):
    report = db.query(ShiftReport).filter(ShiftReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="تقرير الوردية غير موجود")

    role = current_user.role.value if hasattr(current_user.role, "value") else current_user.role
    check_hotel_access(current_user, report.hotel_id)

    _enforce_attendance_before_shift_submit(db, current_user, report.hotel_id)

    if role == "reception" and report.reporter_id != current_user.id:
        raise HTTPException(status_code=403, detail="لا يمكنك تعديل تقرير غير تابع لك")

    if report.status != ReportStatus.pending:
        raise HTTPException(status_code=400, detail="لا يمكن تعديل تقرير تم اعتماده أو رفضه")

    submitted_at = _utc_or_assume(report.submitted_at)
    deadline = submitted_at + timedelta(minutes=SHIFT_REPORT_EDIT_WINDOW_MINUTES)
    if _now_utc() > deadline:
        raise HTTPException(
            status_code=400,
            detail=f"انتهت مهلة التعديل ({SHIFT_REPORT_EDIT_WINDOW_MINUTES} دقيقة)",
        )

    payload = req.model_dump(exclude_unset=True)
    if not payload:
        raise HTTPException(status_code=400, detail="لا توجد بيانات للتعديل")

    if "shift_type" in payload and payload["shift_type"] is not None:
        try:
            payload["shift_type"] = ShiftType(payload["shift_type"])
        except ValueError:
            raise HTTPException(status_code=400, detail="نوع وردية غير صحيح")

    if "photo_url" in payload and payload["photo_url"]:
        if not _is_local_shift_photo_url(payload["photo_url"]):
            raise HTTPException(status_code=400, detail="رابط صورة التقرير غير صالح")

    if "photo_url" in payload and report.photo_url and report.photo_url != payload["photo_url"]:
        _safe_delete_local_shift_photo(report.photo_url)

    old_values = {}
    new_values = {}
    for field_name, new_value in payload.items():
        old_value = getattr(report, field_name)
        if old_value != new_value:
            old_values[field_name] = _str_if_decimal(old_value)
            new_values[field_name] = _str_if_decimal(new_value)
            setattr(report, field_name, new_value)

    if not new_values:
        raise HTTPException(status_code=400, detail="لا توجد تغييرات فعلية")

    _audit(
        db,
        entity_type="shift_report",
        entity_id=report.id,
        action="updated",
        actor_id=current_user.id,
        hotel_id=report.hotel_id,
        payload={"old": old_values, "new": new_values},
    )

    db.commit()
    db.refresh(report)
    return ShiftReportOut.model_validate(report)


@router.get("/shift-reports", response_model=List[ShiftReportOut])
def list_shift_reports(
    status_filter: Optional[str] = None,
    shift_date: Optional[date] = None,
    hotel_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role = current_user.role.value if hasattr(current_user.role, "value") else current_user.role

    q = db.query(ShiftReport)

    if role == "admin":
        if hotel_id:
            q = q.filter(ShiftReport.hotel_id == hotel_id)
    elif role in ["accountant", "supervisor", "superfv"]:
        q = q.filter(ShiftReport.hotel_id == current_user.hotel_id)
    elif role == "reception":
        q = q.filter(ShiftReport.reporter_id == current_user.id)
    else:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية عرض التقارير المالية")

    if status_filter:
        try:
            s = ReportStatus(status_filter)
        except ValueError:
            raise HTTPException(status_code=400, detail="حالة غير صحيحة")
        q = q.filter(ShiftReport.status == s)

    if shift_date:
        q = q.filter(ShiftReport.shift_date == shift_date)

    reports = q.order_by(ShiftReport.shift_date.desc(), ShiftReport.submitted_at.desc()).all()
    return [ShiftReportOut.model_validate(r) for r in reports]


@router.patch("/shift-reports/{report_id}/review", response_model=ShiftReportOut)
def review_shift_report(
    report_id: int,
    req: ShiftReportReviewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "accountant")),
):
    report = db.query(ShiftReport).filter(ShiftReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="تقرير الوردية غير موجود")

    check_hotel_access(current_user, report.hotel_id)

    if report.status != ReportStatus.pending:
        raise HTTPException(status_code=400, detail="لا يمكن مراجعة تقرير تم اعتماده/رفضه سابقاً")

    try:
        new_status = ReportStatus(req.status)
    except ValueError:
        raise HTTPException(status_code=400, detail="حالة المراجعة غير صحيحة")

    if new_status not in [ReportStatus.approved, ReportStatus.rejected]:
        raise HTTPException(status_code=400, detail="المحاسب يمكنه فقط الاعتماد أو الرفض")

    report.status = new_status
    report.review_note = req.review_note
    report.reviewed_by_id = current_user.id
    report.reviewed_at = _now_utc()

    if new_status == ReportStatus.approved:
        _safe_delete_local_shift_photo(report.photo_url)
        report.photo_url = None

    _audit(
        db,
        entity_type="shift_report",
        entity_id=report.id,
        action=f"reviewed_{new_status.value}",
        actor_id=current_user.id,
        hotel_id=report.hotel_id,
        payload={"review_note": req.review_note},
    )

    db.commit()
    db.refresh(report)
    return ShiftReportOut.model_validate(report)


@router.post("/expenses", response_model=ExpenseOut)
def create_expense(
    req: ExpenseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "accountant", "supervisor", "superfv", "maintenance")),
):
    role = current_user.role.value if hasattr(current_user.role, "value") else current_user.role

    hotel_id = current_user.hotel_id
    if role == "admin":
        if not req.hotel_id:
            raise HTTPException(status_code=400, detail="يجب تحديد الفندق")
        hotel_id = req.hotel_id
    elif req.hotel_id and req.hotel_id != current_user.hotel_id:
        raise HTTPException(status_code=403, detail="لا تملك صلاحية الإضافة لفندق آخر")

    try:
        category = ExpenseCategory(req.category)
    except ValueError:
        raise HTTPException(status_code=400, detail="فئة مصروف غير صحيحة")

    maintenance_report_id = req.maintenance_report_id
    if maintenance_report_id:
        report = db.query(MaintenanceReport).filter(MaintenanceReport.id == maintenance_report_id).first()
        if not report:
            raise HTTPException(status_code=404, detail="بلاغ الصيانة المرتبط غير موجود")
        if report.hotel_id != hotel_id:
            raise HTTPException(status_code=400, detail="بلاغ الصيانة من فندق مختلف")

    expense = Expense(
        hotel_id=hotel_id,
        created_by_id=current_user.id,
        category=category,
        amount=req.amount,
        description=req.description,
        expense_date=req.expense_date or date.today(),
        maintenance_report_id=maintenance_report_id,
    )
    db.add(expense)
    db.flush()

    _audit(
        db,
        entity_type="expense",
        entity_id=expense.id,
        action="created",
        actor_id=current_user.id,
        hotel_id=hotel_id,
        payload={
            "category": category.value,
            "amount": str(req.amount),
            "expense_date": str(expense.expense_date),
            "maintenance_report_id": maintenance_report_id,
        },
    )

    db.commit()
    db.refresh(expense)
    return ExpenseOut.model_validate(expense)


@router.get("/expenses", response_model=List[ExpenseOut])
def list_expenses(
    hotel_id: Optional[int] = None,
    expense_date: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role = current_user.role.value if hasattr(current_user.role, "value") else current_user.role

    q = db.query(Expense)
    if role == "admin":
        if hotel_id:
            q = q.filter(Expense.hotel_id == hotel_id)
    elif role in ["accountant", "supervisor", "superfv", "maintenance", "reception"]:
        q = q.filter(Expense.hotel_id == current_user.hotel_id)
    else:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية عرض المصروفات")

    if expense_date:
        q = q.filter(Expense.expense_date == expense_date)

    expenses = q.order_by(Expense.expense_date.desc(), Expense.created_at.desc()).all()
    return [ExpenseOut.model_validate(e) for e in expenses]


@router.get("/income/dashboard", response_model=IncomeDashboardOut)
def income_dashboard(
    range: str = "month",
    hotel_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    today = date.today()

    def _sum_for_dates(from_date: date, to_date: date) -> Decimal:
        q = db.query(ShiftReport).filter(
            ShiftReport.status == ReportStatus.approved,
            ShiftReport.shift_date >= from_date,
            ShiftReport.shift_date <= to_date,
        )
        if hotel_id is not None:
            q = q.filter(ShiftReport.hotel_id == hotel_id)
        rows = q.all()
        total_amt = Decimal("0")
        for r in rows:
            total_amt += _as_decimal(r.network_revenue) + _as_decimal(r.cash_revenue)
        return total_amt

    selected_from, selected_to = _income_range_dates(range)

    totals = IncomeTotalsOut(
        today=_sum_for_dates(today, today),
        week=_sum_for_dates(today - timedelta(days=today.weekday()), today),
        month=_sum_for_dates(today.replace(day=1), today),
        year=_sum_for_dates(date(today.year, 1, 1), today),
    )

    q = db.query(ShiftReport).filter(
        ShiftReport.status == ReportStatus.approved,
        ShiftReport.shift_date >= selected_from,
        ShiftReport.shift_date <= selected_to,
    )
    if hotel_id is not None:
        q = q.filter(ShiftReport.hotel_id == hotel_id)

    rows = q.order_by(ShiftReport.shift_date.desc()).all()
    users = {u.id: u for u in db.query(User).all()}
    hotels = {h.id: h.name for h in db.query(Hotel).all()}

    by_employee: dict[int, dict[str, Decimal | int | str]] = {}
    total_revenue = Decimal("0")
    for r in rows:
        revenue = _as_decimal(r.network_revenue) + _as_decimal(r.cash_revenue)
        total_revenue += revenue
        if r.reporter_id not in by_employee:
            u = users.get(r.reporter_id)
            by_employee[r.reporter_id] = {
                "reports_count": 0,
                "total_revenue": Decimal("0"),
                "full_name": u.full_name if u else f"User {r.reporter_id}",
                "hotel_name": hotels.get(r.hotel_id, f"Hotel {r.hotel_id}"),
            }
        by_employee[r.reporter_id]["reports_count"] = int(by_employee[r.reporter_id]["reports_count"]) + 1
        by_employee[r.reporter_id]["total_revenue"] = _as_decimal(by_employee[r.reporter_id]["total_revenue"]) + revenue

    employees_out = [
        IncomeEmployeeRowOut(
            user_id=uid,
            full_name=str(data["full_name"]),
            hotel_name=str(data["hotel_name"]),
            reports_count=int(data["reports_count"]),
            total_revenue=_as_decimal(data["total_revenue"]),
        )
        for uid, data in sorted(by_employee.items(), key=lambda kv: _as_decimal(kv[1]["total_revenue"]), reverse=True)
    ]

    return IncomeDashboardOut(
        totals=totals,
        selected_range=IncomeSummaryOut(
            from_date=selected_from,
            to_date=selected_to,
            total_revenue=total_revenue,
            by_employee=employees_out,
        ),
    )


@router.get("/income/export")
def income_export_xlsx(
    range: str = "month",
    hotel_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    data = income_dashboard(range=range, hotel_id=hotel_id, db=db, current_user=current_user)

    wb = Workbook()
    ws = wb.active
    ws.title = "Income"
    ws.append(["من", str(data.selected_range.from_date), "إلى", str(data.selected_range.to_date)])
    ws.append(["إجمالي النطاق", float(data.selected_range.total_revenue)])
    ws.append(["إجمالي اليوم", float(data.totals.today), "الأسبوع", float(data.totals.week), "الشهر", float(data.totals.month), "السنة", float(data.totals.year)])
    ws.append([])
    ws.append(["الموظف", "الفندق", "عدد التقارير", "إجمالي الدخل"])
    for row in data.selected_range.by_employee:
        ws.append([row.full_name, row.hotel_name, row.reports_count, float(row.total_revenue)])

    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    filename = f"income_{range}_{date.today().isoformat()}.xlsx"

    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/purchase-orders", response_model=PurchaseOrderOut)
def create_purchase_order(
    req: PurchaseOrderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "supervisor", "superfv")),
):
    role = current_user.role.value if hasattr(current_user.role, "value") else current_user.role
    target_hotel_id = current_user.hotel_id
    if role == "admin":
        if not req.hotel_id:
            raise HTTPException(status_code=400, detail="يجب تحديد الفندق")
        target_hotel_id = req.hotel_id
    elif req.hotel_id and req.hotel_id != current_user.hotel_id:
        raise HTTPException(status_code=403, detail="لا يمكنك إنشاء سند لفندق آخر")

    row = PurchaseOrder(
        hotel_id=target_hotel_id,
        requester_id=current_user.id,
        title=req.title.strip(),
        description=req.description.strip(),
        amount=req.amount,
        request_date=req.request_date or date.today(),
        status=PurchaseOrderStatus.pending,
    )
    db.add(row)
    db.flush()

    _audit(
        db,
        entity_type="purchase_order",
        entity_id=row.id,
        action="created",
        actor_id=current_user.id,
        hotel_id=target_hotel_id,
        payload={"title": row.title, "amount": str(row.amount)},
    )

    db.commit()
    db.refresh(row)
    users = {u.id: u.full_name for u in db.query(User).all()}
    hotels = {h.id: h.name for h in db.query(Hotel).all()}
    return _purchase_order_out(row, users, hotels)


@router.get("/purchase-orders", response_model=List[PurchaseOrderOut])
def list_purchase_orders(
    hotel_id: Optional[int] = None,
    status_filter: Optional[str] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    search: Optional[str] = None,
    min_amount: Optional[Decimal] = None,
    max_amount: Optional[Decimal] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "accountant", "supervisor", "superfv")),
):
    role = current_user.role.value if hasattr(current_user.role, "value") else current_user.role
    q = db.query(PurchaseOrder)

    if role == "admin":
        if hotel_id is not None:
            q = q.filter(PurchaseOrder.hotel_id == hotel_id)
    elif role == "accountant":
        if current_user.hotel_id is not None:
            q = q.filter(PurchaseOrder.hotel_id == current_user.hotel_id)
    else:
        q = q.filter(PurchaseOrder.requester_id == current_user.id)

    if status_filter:
        try:
            s = PurchaseOrderStatus(status_filter)
        except ValueError:
            raise HTTPException(status_code=400, detail="حالة السند غير صحيحة")
        q = q.filter(PurchaseOrder.status == s)

    if from_date:
        q = q.filter(PurchaseOrder.request_date >= from_date)
    if to_date:
        q = q.filter(PurchaseOrder.request_date <= to_date)
    if min_amount is not None:
        q = q.filter(PurchaseOrder.amount >= min_amount)
    if max_amount is not None:
        q = q.filter(PurchaseOrder.amount <= max_amount)
    if search and search.strip():
        like = f"%{search.strip()}%"
        q = q.filter(
            (PurchaseOrder.title.ilike(like))
            | (PurchaseOrder.description.ilike(like))
            | (PurchaseOrder.review_note.ilike(like))
        )

    rows = q.order_by(PurchaseOrder.request_date.desc(), PurchaseOrder.created_at.desc()).all()
    users = {u.id: u.full_name for u in db.query(User).all()}
    hotels = {h.id: h.name for h in db.query(Hotel).all()}
    return [_purchase_order_out(r, users, hotels) for r in rows]


@router.patch("/purchase-orders/{order_id}/review", response_model=PurchaseOrderOut)
def review_purchase_order(
    order_id: int,
    req: PurchaseOrderReviewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("accountant", "admin")),
):
    row = db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="سند الشراء غير موجود")

    check_hotel_access(current_user, row.hotel_id)

    if row.status != PurchaseOrderStatus.pending:
        raise HTTPException(status_code=400, detail="تمت مراجعة السند مسبقاً")

    try:
        new_status = PurchaseOrderStatus(req.status)
    except ValueError:
        raise HTTPException(status_code=400, detail="الحالة غير صحيحة")

    if new_status == PurchaseOrderStatus.rejected and not (req.review_note or "").strip():
        raise HTTPException(status_code=400, detail="سبب الرفض مطلوب")

    row.status = new_status
    row.review_note = req.review_note
    row.reviewed_by_id = current_user.id
    row.reviewed_at = _now_utc()

    if new_status == PurchaseOrderStatus.approved:
        db.add(
            Expense(
                hotel_id=row.hotel_id,
                created_by_id=row.requester_id,
                category=ExpenseCategory.purchase,
                amount=row.amount,
                description=f"سند شراء معتمد #{row.id}: {row.title}",
                expense_date=row.request_date,
            )
        )

    _audit(
        db,
        entity_type="purchase_order",
        entity_id=row.id,
        action=f"reviewed_{new_status.value}",
        actor_id=current_user.id,
        hotel_id=row.hotel_id,
        payload={"review_note": req.review_note},
    )

    db.commit()
    db.refresh(row)
    users = {u.id: u.full_name for u in db.query(User).all()}
    hotels = {h.id: h.name for h in db.query(Hotel).all()}
    return _purchase_order_out(row, users, hotels)


@router.get("/purchase-orders/report", response_model=ExpenseReportOut)
def purchase_orders_report(
    hotel_id: Optional[int] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "accountant")),
):
    q = db.query(PurchaseOrder)
    role = current_user.role.value if hasattr(current_user.role, "value") else current_user.role

    if role != "admin":
        q = q.filter(PurchaseOrder.hotel_id == current_user.hotel_id)
    elif hotel_id is not None:
        q = q.filter(PurchaseOrder.hotel_id == hotel_id)

    if from_date:
        q = q.filter(PurchaseOrder.request_date >= from_date)
    if to_date:
        q = q.filter(PurchaseOrder.request_date <= to_date)

    rows = q.all()
    total_amount = Decimal("0")
    pending_count = 0
    approved_count = 0
    rejected_count = 0
    for r in rows:
        total_amount += _as_decimal(r.amount)
        if r.status == PurchaseOrderStatus.pending:
            pending_count += 1
        elif r.status == PurchaseOrderStatus.approved:
            approved_count += 1
        elif r.status == PurchaseOrderStatus.rejected:
            rejected_count += 1

    return ExpenseReportOut(
        total_count=len(rows),
        total_amount=total_amount,
        pending_count=pending_count,
        approved_count=approved_count,
        rejected_count=rejected_count,
    )


@router.get("/combined-report/export")
def export_combined_report_csv(
    hotel_id: Optional[int] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "accountant", "supervisor", "superfv")),
):
    role = current_user.role.value if hasattr(current_user.role, "value") else current_user.role

    po_query = db.query(PurchaseOrder)
    wr_query = db.query(WarehouseRequest)
    if role == "admin":
        if hotel_id is not None:
            po_query = po_query.filter(PurchaseOrder.hotel_id == hotel_id)
            wr_query = wr_query.filter(WarehouseRequest.hotel_id == hotel_id)
    elif role in ["accountant", "superfv"]:
        if current_user.hotel_id is not None:
            po_query = po_query.filter(PurchaseOrder.hotel_id == current_user.hotel_id)
            wr_query = wr_query.filter(WarehouseRequest.hotel_id == current_user.hotel_id)
    else:
        po_query = po_query.filter(PurchaseOrder.requester_id == current_user.id)
        wr_query = wr_query.filter(WarehouseRequest.requester_id == current_user.id)

    if from_date:
        po_query = po_query.filter(PurchaseOrder.request_date >= from_date)
        wr_query = wr_query.filter(func.date(WarehouseRequest.created_at) >= from_date)
    if to_date:
        po_query = po_query.filter(PurchaseOrder.request_date <= to_date)
        wr_query = wr_query.filter(func.date(WarehouseRequest.created_at) <= to_date)

    purchase_orders = po_query.order_by(PurchaseOrder.request_date.desc()).all()
    warehouse_requests = wr_query.order_by(WarehouseRequest.created_at.desc()).all()

    hotels = {h.id: h.name for h in db.query(Hotel).all()}
    users = {u.id: u.full_name for u in db.query(User).all()}

    lines = [
        "type,date,hotel,requester,title_or_item,amount_or_quantity,status,note",
    ]

    def esc(v: Optional[str]) -> str:
        raw = "" if v is None else str(v)
        return '"' + raw.replace('"', '""') + '"'

    for r in purchase_orders:
        lines.append(
            ",".join(
                [
                    esc("purchase_order"),
                    esc(str(r.request_date)),
                    esc(hotels.get(r.hotel_id, f"Hotel {r.hotel_id}")),
                    esc(users.get(r.requester_id, f"User {r.requester_id}")),
                    esc(r.title),
                    esc(str(_as_decimal(r.amount))),
                    esc(r.status.value if hasattr(r.status, "value") else str(r.status)),
                    esc(r.review_note or r.description),
                ]
            )
        )

    for r in warehouse_requests:
        lines.append(
            ",".join(
                [
                    esc("warehouse_request"),
                    esc(str((r.created_at or _now_utc()).date())),
                    esc(hotels.get(r.hotel_id, f"Hotel {r.hotel_id}")),
                    esc(users.get(r.requester_id, f"User {r.requester_id}")),
                    esc(r.item.item_name if r.item else f"Item {r.item_id}"),
                    esc(str(r.quantity_approved if r.quantity_approved is not None else r.quantity_requested)),
                    esc(r.status.value if hasattr(r.status, "value") else str(r.status)),
                    esc(r.review_note or r.note),
                ]
            )
        )

    csv = "\ufeff" + "\n".join(lines)
    filename = f"combined_report_{date.today().isoformat()}.csv"
    return StreamingResponse(
        BytesIO(csv.encode("utf-8")),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/revenue/summary", response_model=RevenueSummaryOut)
def revenue_summary(
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role = current_user.role.value if hasattr(current_user.role, "value") else current_user.role

    q = db.query(ShiftReport).filter(ShiftReport.status == ReportStatus.approved)

    if role != "admin":
        q = q.filter(ShiftReport.hotel_id == current_user.hotel_id)

    if from_date:
        q = q.filter(ShiftReport.shift_date >= from_date)
    if to_date:
        q = q.filter(ShiftReport.shift_date <= to_date)

    rows = q.all()

    by_hotel: Dict[int, Decimal] = defaultdict(lambda: Decimal("0"))
    by_day: Dict[date, Decimal] = defaultdict(lambda: Decimal("0"))
    by_shift: Dict[str, Decimal] = defaultdict(lambda: Decimal("0"))

    total = Decimal("0")
    for r in rows:
        rev = _as_decimal(r.network_revenue) + _as_decimal(r.cash_revenue)
        total += rev
        by_hotel[r.hotel_id] += rev
        by_day[r.shift_date] += rev
        by_shift[r.shift_type.value] += rev

    hotels = {h.id: h.name for h in db.query(Hotel).all()}

    return RevenueSummaryOut(
        total_revenue=total,
        by_hotel=[
            RevenueByHotelOut(hotel_id=hid, hotel_name=hotels.get(hid, f"Hotel {hid}"), revenue=amt)
            for hid, amt in sorted(by_hotel.items(), key=lambda x: x[1], reverse=True)
        ],
        by_day=[
            RevenueByDayOut(day=day, revenue=amt)
            for day, amt in sorted(by_day.items(), key=lambda x: x[0])
        ],
        by_shift=[
            RevenueByShiftOut(shift_type=s, revenue=amt)
            for s, amt in sorted(by_shift.items(), key=lambda x: x[0])
        ],
    )


@router.get("/dashboard/overview", response_model=FinancialDashboardOut)
def finance_dashboard_overview(
    days: int = 7,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role = current_user.role.value if hasattr(current_user.role, "value") else current_user.role
    if role not in ["admin", "accountant", "supervisor", "superfv"]:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية عرض لوحة المال")

    if days < 1:
        days = 1
    if days > 60:
        days = 60

    today = date.today()
    start_day = today - timedelta(days=days - 1)

    reports_q = db.query(ShiftReport).filter(
        ShiftReport.status == ReportStatus.approved,
        ShiftReport.shift_date >= start_day,
        ShiftReport.shift_date <= today,
    )
    expenses_q = db.query(Expense).filter(
        Expense.expense_date >= start_day,
        Expense.expense_date <= today,
    )

    if role != "admin":
        reports_q = reports_q.filter(ShiftReport.hotel_id == current_user.hotel_id)
        expenses_q = expenses_q.filter(Expense.hotel_id == current_user.hotel_id)

    reports = reports_q.all()
    expenses = expenses_q.all()

    daily_revenue: Dict[date, Decimal] = defaultdict(lambda: Decimal("0"))
    daily_expenses: Dict[date, Decimal] = defaultdict(lambda: Decimal("0"))

    revenue_by_hotel: Dict[int, Decimal] = defaultdict(lambda: Decimal("0"))
    expense_by_hotel: Dict[int, Decimal] = defaultdict(lambda: Decimal("0"))

    total_revenue = Decimal("0")
    total_expenses = Decimal("0")

    for r in reports:
        rev = _as_decimal(r.network_revenue) + _as_decimal(r.cash_revenue)
        total_revenue += rev
        daily_revenue[r.shift_date] += rev
        revenue_by_hotel[r.hotel_id] += rev

    for e in expenses:
        amt = _as_decimal(e.amount)
        total_expenses += amt
        daily_expenses[e.expense_date] += amt
        expense_by_hotel[e.hotel_id] += amt

    net_profit = total_revenue - total_expenses

    hotels = {h.id: h.name for h in db.query(Hotel).all()}

    highest_revenue_hotel = None
    if revenue_by_hotel:
        hid, amount = sorted(revenue_by_hotel.items(), key=lambda x: x[1], reverse=True)[0]
        highest_revenue_hotel = HotelAmountOut(hotel_id=hid, hotel_name=hotels.get(hid, f"Hotel {hid}"), amount=amount)

    hotel_profit: Dict[int, Decimal] = defaultdict(lambda: Decimal("0"))
    hotel_ids = set(revenue_by_hotel.keys()) | set(expense_by_hotel.keys())
    for hid in hotel_ids:
        hotel_profit[hid] = revenue_by_hotel.get(hid, Decimal("0")) - expense_by_hotel.get(hid, Decimal("0"))

    lowest_profit_hotel = None
    if hotel_profit:
        hid, amount = sorted(hotel_profit.items(), key=lambda x: x[1])[0]
        lowest_profit_hotel = HotelAmountOut(hotel_id=hid, hotel_name=hotels.get(hid, f"Hotel {hid}"), amount=amount)

    most_expensive_hotel = None
    if expense_by_hotel:
        hid, amount = sorted(expense_by_hotel.items(), key=lambda x: x[1], reverse=True)[0]
        most_expensive_hotel = HotelAmountOut(hotel_id=hid, hotel_name=hotels.get(hid, f"Hotel {hid}"), amount=amount)

    expense_ids = [e.id for e in expenses if e.maintenance_report_id]
    most_expensive_fault_type = None
    if expense_ids:
        cost_by_fault: Dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
        reports_map = {
            r.id: r
            for r in db.query(MaintenanceReport)
            .filter(MaintenanceReport.id.in_([e.maintenance_report_id for e in expenses if e.maintenance_report_id]))
            .all()
        }
        for e in expenses:
            if not e.maintenance_report_id:
                continue
            rep = reports_map.get(e.maintenance_report_id)
            if not rep:
                continue
            ftype = _fault_type(rep)
            cost_by_fault[ftype] += _as_decimal(e.amount)

        if cost_by_fault:
            ftype, amt = sorted(cost_by_fault.items(), key=lambda x: x[1], reverse=True)[0]
            most_expensive_fault_type = FaultCostOut(fault_type=ftype, amount=amt)

    daily_comparison: List[FinancialDailyComparisonOut] = []
    cursor = start_day
    while cursor <= today:
        rev = daily_revenue.get(cursor, Decimal("0"))
        exp = daily_expenses.get(cursor, Decimal("0"))
        daily_comparison.append(
            FinancialDailyComparisonOut(
                day=cursor,
                revenue=rev,
                expenses=exp,
                profit=rev - exp,
            )
        )
        cursor += timedelta(days=1)

    return FinancialDashboardOut(
        total_revenue=total_revenue,
        total_expenses=total_expenses,
        net_profit=net_profit,
        highest_revenue_hotel=highest_revenue_hotel,
        lowest_profit_hotel=lowest_profit_hotel,
        most_expensive_hotel=most_expensive_hotel,
        most_expensive_fault_type=most_expensive_fault_type,
        daily_comparison=daily_comparison,
    )


@router.get("/admin-reports/overview", response_model=AdminReportsOverviewOut)
def admin_reports_overview(
    days: int = 30,
    hotel_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "accountant", "supervisor", "superfv")),
):
    role = current_user.role.value if hasattr(current_user.role, "value") else current_user.role

    if days < 1:
        days = 1
    if days > 90:
        days = 90

    target_hotel_id = hotel_id
    if role != "admin":
        target_hotel_id = current_user.hotel_id
    elif target_hotel_id is not None:
        hotel = db.query(Hotel).filter(Hotel.id == target_hotel_id).first()
        if not hotel:
            raise HTTPException(status_code=404, detail="الفندق غير موجود")

    today = date.today()
    start_day = today - timedelta(days=days - 1)
    start_dt = datetime.combine(start_day, datetime.min.time(), tzinfo=timezone.utc)

    hotels = db.query(Hotel).all()
    hotel_map = {h.id: h.name for h in hotels}

    shifts_q = db.query(ShiftReport)
    expenses_q = db.query(Expense)
    rooms_q = db.query(Room)
    users_q = db.query(User)
    tasks_q = db.query(Task)

    if target_hotel_id is not None:
        shifts_q = shifts_q.filter(ShiftReport.hotel_id == target_hotel_id)
        expenses_q = expenses_q.filter(Expense.hotel_id == target_hotel_id)
        rooms_q = rooms_q.filter(Room.hotel_id == target_hotel_id)
        users_q = users_q.filter(User.hotel_id == target_hotel_id)
        tasks_q = tasks_q.filter(Task.hotel_id == target_hotel_id)
    elif role != "admin":
        shifts_q = shifts_q.filter(ShiftReport.hotel_id == current_user.hotel_id)
        expenses_q = expenses_q.filter(Expense.hotel_id == current_user.hotel_id)
        rooms_q = rooms_q.filter(Room.hotel_id == current_user.hotel_id)
        users_q = users_q.filter(User.hotel_id == current_user.hotel_id)
        tasks_q = tasks_q.filter(Task.hotel_id == current_user.hotel_id)

    today_revenue = Decimal("0")
    approved_today_reports = shifts_q.filter(
        ShiftReport.status == ReportStatus.approved,
        ShiftReport.shift_date == today,
    ).all()
    for r in approved_today_reports:
        today_revenue += _as_decimal(r.network_revenue) + _as_decimal(r.cash_revenue)

    today_expenses = Decimal("0")
    today_expense_rows = expenses_q.filter(Expense.expense_date == today).all()
    for e in today_expense_rows:
        today_expenses += _as_decimal(e.amount)

    recent_reports_rows = shifts_q.order_by(
        ShiftReport.shift_date.desc(),
        ShiftReport.submitted_at.desc(),
    ).limit(20).all()

    reporter_ids = {r.reporter_id for r in recent_reports_rows}
    reporter_map = {}
    if reporter_ids:
        reporter_map = {
            u.id: u.full_name
            for u in db.query(User).filter(User.id.in_(list(reporter_ids))).all()
        }

    recent_shift_reports = [
        AdminReportsShiftRowOut(
            hotel_name=hotel_map.get(r.hotel_id, f"Hotel {r.hotel_id}"),
            shift_type=r.shift_type.value,
            reporter_name=reporter_map.get(r.reporter_id, f"User {r.reporter_id}"),
            network_revenue=_as_decimal(r.network_revenue),
            cash_revenue=_as_decimal(r.cash_revenue),
            rooms_sold=r.rooms_sold,
            status=r.status.value,
            shift_date=r.shift_date,
        )
        for r in recent_reports_rows
    ]

    period_tasks = tasks_q.filter(Task.created_at >= start_dt).all()
    users = users_q.filter(User.is_active.is_(True)).all()

    task_by_user_total: Dict[int, int] = defaultdict(int)
    task_by_user_completed: Dict[int, int] = defaultdict(int)
    for t in period_tasks:
        if not t.assigned_to_id:
            continue
        task_by_user_total[t.assigned_to_id] += 1
        if t.status in [TaskStatus.completed, TaskStatus.closed]:
            task_by_user_completed[t.assigned_to_id] += 1

    rejected_report_count: Dict[int, int] = defaultdict(int)
    reception_rows = shifts_q.filter(
        ShiftReport.shift_date >= start_day,
        ShiftReport.shift_date <= today,
    ).all()
    for r in reception_rows:
        if r.status == ReportStatus.rejected:
            rejected_report_count[r.reporter_id] += 1

    staff_performance: List[AdminReportsStaffPerformanceOut] = []
    for u in users:
        total_tasks = task_by_user_total.get(u.id, 0)
        completed_tasks = task_by_user_completed.get(u.id, 0)
        completion_rate = _percent(completed_tasks, total_tasks)

        quality_score = max(50, 100 - (rejected_report_count.get(u.id, 0) * 10))
        discipline_base = 65 + min(30, completed_tasks * 2)
        discipline_penalty = max(0, total_tasks - completed_tasks) * 2
        discipline_score = max(45, min(100, discipline_base - discipline_penalty))
        overall_score = int(round((completion_rate * 0.5) + (quality_score * 0.3) + (discipline_score * 0.2)))

        if total_tasks == 0 and rejected_report_count.get(u.id, 0) == 0:
            continue

        staff_performance.append(
            AdminReportsStaffPerformanceOut(
                user_id=u.id,
                full_name=u.full_name,
                hotel_name=hotel_map.get(u.hotel_id, "إدارة عامة"),
                role=u.role.value if hasattr(u.role, "value") else str(u.role),
                tasks_total=total_tasks,
                tasks_completed=completed_tasks,
                completion_rate=completion_rate,
                quality_score=quality_score,
                discipline_score=discipline_score,
                overall_score=overall_score,
            )
        )

    staff_performance.sort(key=lambda x: x.overall_score, reverse=True)
    staff_performance = staff_performance[:30]

    rooms = rooms_q.all()
    rooms_total = len(rooms)
    rooms_ready = sum(1 for r in rooms if r.status == RoomStatus.ready)
    rooms_cleaning = sum(1 for r in rooms if r.status == RoomStatus.cleaning)
    rooms_maintenance = sum(1 for r in rooms if r.status == RoomStatus.maintenance)
    rooms_dirty = sum(1 for r in rooms if r.status == RoomStatus.dirty)
    rooms_occupied = sum(1 for r in rooms if r.status == RoomStatus.occupied)

    warehouse_rows = (
        db.query(WarehouseItem)
        .filter(WarehouseItem.is_active == 1)
        .order_by(WarehouseItem.item_name.asc())
        .all()
    )

    warehouse_items = [
        AdminReportsWarehouseItemOut(
            id=row.id,
            item_name=row.item_name,
            quantity=int(row.quantity or 0),
            reorder_level=int(row.reorder_level or 0),
            status=_warehouse_status(int(row.quantity or 0), int(row.reorder_level or 0)),
            unit=row.unit or "قطعة",
        )
        for row in warehouse_rows
    ]

    return AdminReportsOverviewOut(
        financial_cards=AdminReportsFinancialCardsOut(
            today_revenue=today_revenue,
            today_expenses=today_expenses,
            today_profit=today_revenue - today_expenses,
        ),
        recent_shift_reports=recent_shift_reports,
        staff_performance=staff_performance,
        rooms=AdminReportsRoomsOut(
            total=rooms_total,
            ready=rooms_ready,
            cleaning=rooms_cleaning,
            maintenance=rooms_maintenance,
            dirty=rooms_dirty,
            occupied=rooms_occupied,
        ),
        warehouse_items=warehouse_items,
    )


@router.get("/warehouse-items", response_model=List[WarehouseItemOut])
def list_warehouse_items(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "accountant", "supervisor", "superfv")),
):
    q = db.query(WarehouseItem)
    if not include_inactive:
        q = q.filter(WarehouseItem.is_active == 1)

    rows = q.order_by(WarehouseItem.item_name.asc()).all()
    out: List[WarehouseItemOut] = []
    for row in rows:
        out.append(
            WarehouseItemOut(
                id=row.id,
                item_name=row.item_name,
                quantity=int(row.quantity or 0),
                reorder_level=int(row.reorder_level or 0),
                unit=row.unit or "قطعة",
                is_active=bool(row.is_active),
                updated_by_id=row.updated_by_id,
                created_at=row.created_at,
                updated_at=row.updated_at,
            )
        )
    return out


@router.post("/warehouse-items", response_model=WarehouseItemOut)
def create_warehouse_item(
    req: WarehouseItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "supervisor", "superfv")),
):
    name = req.item_name.strip()
    unit = req.unit.strip()

    existing = (
        db.query(WarehouseItem)
        .filter(func.lower(WarehouseItem.item_name) == name.lower())
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="الصنف موجود بالفعل")

    row = WarehouseItem(
        item_name=name,
        quantity=req.quantity,
        reorder_level=req.reorder_level,
        unit=unit,
        is_active=1,
        updated_by_id=current_user.id,
    )
    db.add(row)
    db.flush()

    _audit(
        db,
        entity_type="warehouse_item",
        entity_id=row.id,
        action="created",
        actor_id=current_user.id,
        hotel_id=None,
        payload={
            "item_name": row.item_name,
            "quantity": row.quantity,
            "reorder_level": row.reorder_level,
            "unit": row.unit,
        },
    )

    db.commit()
    db.refresh(row)

    return WarehouseItemOut(
        id=row.id,
        item_name=row.item_name,
        quantity=int(row.quantity or 0),
        reorder_level=int(row.reorder_level or 0),
        unit=row.unit or "قطعة",
        is_active=bool(row.is_active),
        updated_by_id=row.updated_by_id,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.patch("/warehouse-items/{item_id}", response_model=WarehouseItemOut)
def update_warehouse_item(
    item_id: int,
    req: WarehouseItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    row = db.query(WarehouseItem).filter(WarehouseItem.id == item_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="الصنف غير موجود")

    payload = req.model_dump(exclude_unset=True)
    if not payload:
        raise HTTPException(status_code=400, detail="لا توجد بيانات للتعديل")

    if "item_name" in payload and payload["item_name"] is not None:
        new_name = payload["item_name"].strip()
        dupe = (
            db.query(WarehouseItem)
            .filter(func.lower(WarehouseItem.item_name) == new_name.lower(), WarehouseItem.id != row.id)
            .first()
        )
        if dupe:
            raise HTTPException(status_code=400, detail="اسم الصنف مستخدم بالفعل")
        row.item_name = new_name

    if "quantity" in payload and payload["quantity"] is not None:
        row.quantity = payload["quantity"]

    if "reorder_level" in payload and payload["reorder_level"] is not None:
        row.reorder_level = payload["reorder_level"]

    if "unit" in payload and payload["unit"] is not None:
        row.unit = payload["unit"].strip()

    if "is_active" in payload and payload["is_active"] is not None:
        row.is_active = 1 if payload["is_active"] else 0

    row.updated_by_id = current_user.id

    _audit(
        db,
        entity_type="warehouse_item",
        entity_id=row.id,
        action="updated",
        actor_id=current_user.id,
        hotel_id=None,
        payload=payload,
    )

    db.commit()
    db.refresh(row)
    return WarehouseItemOut(
        id=row.id,
        item_name=row.item_name,
        quantity=int(row.quantity or 0),
        reorder_level=int(row.reorder_level or 0),
        unit=row.unit or "قطعة",
        is_active=bool(row.is_active),
        updated_by_id=row.updated_by_id,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.post("/warehouse-items/{item_id}/consume", response_model=WarehouseItemOut)
def consume_warehouse_item(
    item_id: int,
    req: WarehouseItemConsumeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    row = db.query(WarehouseItem).filter(WarehouseItem.id == item_id, WarehouseItem.is_active == 1).first()
    if not row:
        raise HTTPException(status_code=404, detail="الصنف غير موجود")

    if req.quantity > int(row.quantity or 0):
        raise HTTPException(status_code=400, detail="الكمية المطلوبة أكبر من المتاح")

    row.quantity = int(row.quantity or 0) - req.quantity
    row.updated_by_id = current_user.id

    _audit(
        db,
        entity_type="warehouse_item",
        entity_id=row.id,
        action="consumed",
        actor_id=current_user.id,
        hotel_id=None,
        payload={
            "quantity": req.quantity,
            "remaining": int(row.quantity or 0),
            "note": req.note,
        },
    )

    db.commit()
    db.refresh(row)
    return WarehouseItemOut(
        id=row.id,
        item_name=row.item_name,
        quantity=int(row.quantity or 0),
        reorder_level=int(row.reorder_level or 0),
        unit=row.unit or "قطعة",
        is_active=bool(row.is_active),
        updated_by_id=row.updated_by_id,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.post("/warehouse-requests", response_model=WarehouseRequestOut)
def create_warehouse_request(
    req: WarehouseRequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "supervisor", "superfv")),
):
    role = current_user.role.value if hasattr(current_user.role, "value") else current_user.role

    target_hotel_id = current_user.hotel_id
    if role == "admin":
        if not req.hotel_id:
            raise HTTPException(status_code=400, detail="يجب تحديد الفندق")
        target_hotel_id = req.hotel_id
    elif req.hotel_id and req.hotel_id != current_user.hotel_id:
        raise HTTPException(status_code=403, detail="لا يمكنك إنشاء طلب لفندق آخر")

    item = db.query(WarehouseItem).filter(WarehouseItem.id == req.item_id, WarehouseItem.is_active == 1).first()
    if not item:
        raise HTTPException(status_code=404, detail="الصنف غير موجود")

    row = WarehouseRequest(
        hotel_id=target_hotel_id,
        item_id=req.item_id,
        requester_id=current_user.id,
        quantity_requested=req.quantity_requested,
        note=req.note,
        status=WarehouseRequestStatus.pending,
    )
    db.add(row)
    db.flush()

    _audit(
        db,
        entity_type="warehouse_request",
        entity_id=row.id,
        action="created",
        actor_id=current_user.id,
        hotel_id=target_hotel_id,
        payload={"item_id": req.item_id, "quantity_requested": req.quantity_requested, "note": req.note},
    )

    db.commit()
    db.refresh(row)

    hotels = {h.id: h.name for h in db.query(Hotel).all()}
    return _warehouse_request_out(row, {current_user.id: current_user.full_name}, hotels)


@router.get("/warehouse-requests", response_model=List[WarehouseRequestOut])
def list_warehouse_requests(
    hotel_id: Optional[int] = None,
    requester_id: Optional[int] = None,
    item_id: Optional[int] = None,
    status_filter: Optional[str] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "accountant", "supervisor", "superfv")),
):
    role = current_user.role.value if hasattr(current_user.role, "value") else current_user.role
    q = db.query(WarehouseRequest)

    if role == "admin":
        if hotel_id is not None:
            q = q.filter(WarehouseRequest.hotel_id == hotel_id)
    elif role == "accountant":
        if current_user.hotel_id is not None:
            q = q.filter(WarehouseRequest.hotel_id == current_user.hotel_id)
    elif role == "superfv":
        if current_user.hotel_id is not None:
            q = q.filter(WarehouseRequest.hotel_id == current_user.hotel_id)
        if hotel_id is not None:
            q = q.filter(WarehouseRequest.hotel_id == hotel_id)
    else:
        q = q.filter(WarehouseRequest.requester_id == current_user.id)

    if requester_id is not None and role in ["admin", "accountant", "superfv"]:
        q = q.filter(WarehouseRequest.requester_id == requester_id)
    if item_id is not None:
        q = q.filter(WarehouseRequest.item_id == item_id)

    if status_filter:
        try:
            q = q.filter(WarehouseRequest.status == WarehouseRequestStatus(status_filter))
        except ValueError:
            raise HTTPException(status_code=400, detail="حالة الطلب غير صحيحة")

    if from_date:
        q = q.filter(func.date(WarehouseRequest.created_at) >= from_date)
    if to_date:
        q = q.filter(func.date(WarehouseRequest.created_at) <= to_date)

    rows = q.order_by(WarehouseRequest.created_at.desc()).all()
    if search and search.strip():
        needle = search.strip().lower()
        rows = [
            r for r in rows
            if needle in (r.note or "").lower()
            or needle in (r.review_note or "").lower()
            or needle in ((r.item.item_name if r.item else "").lower())
        ]

    user_ids = {r.requester_id for r in rows}
    users = {u.id: u.full_name for u in db.query(User).filter(User.id.in_(list(user_ids))).all()} if user_ids else {}
    hotels = {h.id: h.name for h in db.query(Hotel).all()}

    return [_warehouse_request_out(r, users, hotels) for r in rows]


@router.patch("/warehouse-requests/{request_id}/review", response_model=WarehouseRequestOut)
def review_warehouse_request(
    request_id: int,
    req: WarehouseRequestReviewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "superfv")),
):
    row = db.query(WarehouseRequest).filter(WarehouseRequest.id == request_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="طلب المستودع غير موجود")

    check_hotel_access(current_user, row.hotel_id)

    if row.status != WarehouseRequestStatus.pending:
        raise HTTPException(status_code=400, detail="الطلب تمت مراجعته مسبقاً")

    try:
        new_status = WarehouseRequestStatus(req.status)
    except ValueError:
        raise HTTPException(status_code=400, detail="حالة الطلب غير صحيحة")

    approved_qty = req.quantity_approved or row.quantity_requested

    if new_status == WarehouseRequestStatus.approved:
        if approved_qty <= 0:
            raise HTTPException(status_code=400, detail="الكمية المعتمدة غير صحيحة")
        item = db.query(WarehouseItem).filter(WarehouseItem.id == row.item_id, WarehouseItem.is_active == 1).first()
        if not item:
            raise HTTPException(status_code=404, detail="الصنف غير موجود")
        if int(item.quantity or 0) < approved_qty:
            raise HTTPException(status_code=400, detail="الكمية غير كافية في المستودع")
        item.quantity = int(item.quantity or 0) - int(approved_qty)
        item.updated_by_id = current_user.id
        row.quantity_approved = int(approved_qty)
    else:
        if not (req.review_note or "").strip():
            raise HTTPException(status_code=400, detail="سبب الرفض مطلوب")

    row.status = new_status
    row.review_note = req.review_note
    row.reviewed_by_id = current_user.id
    row.reviewed_at = _now_utc()

    _audit(
        db,
        entity_type="warehouse_request",
        entity_id=row.id,
        action=f"reviewed_{new_status.value}",
        actor_id=current_user.id,
        hotel_id=row.hotel_id,
        payload={"quantity_approved": row.quantity_approved, "review_note": req.review_note},
    )

    db.commit()
    db.refresh(row)
    user_map = {row.requester_id: (row.requester.full_name if row.requester else f"User {row.requester_id}")}
    hotels = {h.id: h.name for h in db.query(Hotel).all()}
    return _warehouse_request_out(row, user_map, hotels)
