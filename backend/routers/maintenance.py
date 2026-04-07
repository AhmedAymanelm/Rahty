from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import List, Optional
from urllib.parse import urlparse, unquote
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy.orm import Session

from database import get_db
from middleware.auth import get_current_user, require_role, check_hotel_access
from models.user import User, UserRole
from models.room import Room, RoomStatus
from models.task import Task, TaskPriority, TaskStatus
from models.maintenance import MaintenanceReport, MaintenanceStatus
from schemas.maintenance import (
    MaintenanceReportCreate,
    MaintenanceReportOut,
    MaintenanceAssignRequest,
    MaintenanceDiagnoseRequest,
    MaintenanceCompleteRequest,
    MaintenancePhotoUpdateRequest,
    MaintenanceVerifyRequest,
    MaintenanceMetricsOut,
)

router = APIRouter(prefix="/api/maintenance", tags=["Maintenance"])

UPLOAD_DIR = Path(__file__).resolve().parents[1] / "uploads" / "maintenance"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _ensure_maintenance_user(db: Session, user_id: int, hotel_id: int) -> User:
    tech = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if not tech:
        raise HTTPException(status_code=404, detail="الفني غير موجود")

    if tech.role != UserRole.maintenance:
        raise HTTPException(status_code=400, detail="المستخدم المحدد ليس فنّي صيانة")

    if tech.hotel_id != hotel_id:
        raise HTTPException(status_code=400, detail="لا يمكن تعيين فني من فندق مختلف")

    return tech


def _can_work_on_report(current_user: User, report: MaintenanceReport) -> None:
    role = current_user.role.value if hasattr(current_user.role, "value") else current_user.role
    if role == "admin":
        return

    check_hotel_access(current_user, report.hotel_id)

    if role in ["supervisor", "superfv"]:
        return

    if role == "maintenance" and report.assigned_to_id == current_user.id:
        return

    raise HTTPException(status_code=403, detail="ليس لديك صلاحية التعامل مع هذا البلاغ")


def _extract_local_upload_path(photo_url: Optional[str]) -> Optional[Path]:
    if not photo_url:
        return None

    parsed = urlparse(photo_url)
    raw_path = unquote(parsed.path)
    marker = "/uploads/maintenance/"
    if marker not in raw_path:
        return None

    filename = raw_path.split(marker, 1)[1].strip()
    if not filename:
        return None

    # Prevent path traversal and nested paths.
    filename = Path(filename).name
    candidate = (UPLOAD_DIR / filename).resolve()
    try:
        candidate.relative_to(UPLOAD_DIR.resolve())
    except ValueError:
        return None
    return candidate


def _safe_delete_local_photo(photo_url: Optional[str]) -> None:
    path = _extract_local_upload_path(photo_url)
    if not path:
        return
    try:
        if path.exists() and path.is_file():
            path.unlink()
    except OSError:
        return


def _is_local_maintenance_photo_url(photo_url: str) -> bool:
    parsed = urlparse(photo_url)
    return "/uploads/maintenance/" in (parsed.path or "")


@router.post("/upload-photo")
async def upload_maintenance_photo(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(require_role("admin", "supervisor", "superfv", "cleaner", "maintenance")),
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
    processed_content = out.getvalue()

    filename = f"{uuid4().hex}{suffix}"
    file_path = UPLOAD_DIR / filename
    file_path.write_bytes(processed_content)

    public_url = f"{request.base_url}uploads/maintenance/{filename}"
    return {"url": public_url}


@router.post("/reports", response_model=MaintenanceReportOut)
def create_report(
    req: MaintenanceReportCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "supervisor", "superfv", "cleaner", "maintenance")),
):
    room = db.query(Room).filter(Room.id == req.room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="الغرفة غير موجودة")

    if not _is_local_maintenance_photo_url(req.before_photo_url):
        raise HTTPException(
            status_code=400,
            detail="يرجى رفع الصورة من داخل النظام قبل إنشاء البلاغ",
        )

    check_hotel_access(current_user, room.hotel_id)

    assigned_to_id = req.assigned_to_id
    if assigned_to_id:
        _ensure_maintenance_user(db, assigned_to_id, room.hotel_id)
    else:
        # Auto-assign to an active technician in the same hotel if available.
        auto_tech = (
            db.query(User)
            .filter(
                User.role == UserRole.maintenance,
                User.hotel_id == room.hotel_id,
                User.is_active == True,
            )
            .order_by(User.id.asc())
            .first()
        )
        if auto_tech:
            assigned_to_id = auto_tech.id

    initial_status = MaintenanceStatus.assigned if assigned_to_id else MaintenanceStatus.reported

    report = MaintenanceReport(
        title=req.title,
        description=req.description,
        hotel_id=room.hotel_id,
        room_id=room.id,
        reported_by_id=current_user.id,
        assigned_to_id=assigned_to_id,
        status=initial_status,
        before_photo_url=req.before_photo_url,
        assigned_at=_now_utc() if assigned_to_id else None,
    )

    room.status = RoomStatus.maintenance

    task = Task(
        title=f"[Maintenance] Room {room.number}: {req.title}",
        description=req.description,
        priority=TaskPriority.high,
        status=TaskStatus.pending,
        hotel_id=room.hotel_id,
        creator_id=current_user.id,
        assigned_to_id=assigned_to_id,
    )

    db.add(report)
    db.add(task)
    db.flush()

    report.task_id = task.id

    db.commit()
    db.refresh(report)
    return MaintenanceReportOut.model_validate(report)


@router.get("/reports", response_model=List[MaintenanceReportOut])
def list_reports(
    status_filter: Optional[str] = None,
    hotel_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(MaintenanceReport)
    role = current_user.role.value if hasattr(current_user.role, "value") else current_user.role

    if role != "admin":
        query = query.filter(MaintenanceReport.hotel_id == current_user.hotel_id)
    elif hotel_id is not None:
        query = query.filter(MaintenanceReport.hotel_id == hotel_id)

    if role == "maintenance":
        query = query.filter(MaintenanceReport.assigned_to_id == current_user.id)

    if status_filter:
        try:
            status_value = MaintenanceStatus(status_filter)
        except ValueError:
            raise HTTPException(status_code=400, detail="حالة بلاغ غير صحيحة")
        query = query.filter(MaintenanceReport.status == status_value)

    reports = query.order_by(MaintenanceReport.created_at.desc()).all()
    return [MaintenanceReportOut.model_validate(r) for r in reports]


@router.get("/reports/{report_id}", response_model=MaintenanceReportOut)
def get_report(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = db.query(MaintenanceReport).filter(MaintenanceReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="بلاغ الصيانة غير موجود")

    _can_work_on_report(current_user, report)

    return MaintenanceReportOut.model_validate(report)


@router.patch("/reports/{report_id}/assign", response_model=MaintenanceReportOut)
def assign_report(
    report_id: int,
    req: MaintenanceAssignRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "supervisor", "superfv")),
):
    report = db.query(MaintenanceReport).filter(MaintenanceReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="بلاغ الصيانة غير موجود")

    check_hotel_access(current_user, report.hotel_id)
    _ensure_maintenance_user(db, req.assigned_to_id, report.hotel_id)

    if report.status == MaintenanceStatus.verified:
        raise HTTPException(status_code=400, detail="البلاغ مغلق بعد التحقق ولا يمكن إعادة تعيينه")

    report.assigned_to_id = req.assigned_to_id
    report.status = MaintenanceStatus.assigned
    if not report.assigned_at:
        report.assigned_at = _now_utc()

    if report.task_id:
        task = db.query(Task).filter(Task.id == report.task_id).first()
        if task:
            task.assigned_to_id = req.assigned_to_id

    db.commit()
    db.refresh(report)
    return MaintenanceReportOut.model_validate(report)


@router.patch("/reports/{report_id}/diagnose", response_model=MaintenanceReportOut)
def diagnose_report(
    report_id: int,
    req: MaintenanceDiagnoseRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = db.query(MaintenanceReport).filter(MaintenanceReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="بلاغ الصيانة غير موجود")

    _can_work_on_report(current_user, report)

    report.diagnosis = req.diagnosis
    report.parts_required = req.parts_required
    report.parts_notes = req.parts_notes

    if req.parts_required:
        report.status = MaintenanceStatus.waiting_parts
        report.waiting_parts_at = _now_utc()
    else:
        report.status = MaintenanceStatus.in_progress
        if not report.started_at:
            report.started_at = _now_utc()

    if report.task_id:
        task = db.query(Task).filter(Task.id == report.task_id).first()
        if task and task.status == TaskStatus.pending:
            task.status = TaskStatus.in_progress

    db.commit()
    db.refresh(report)
    return MaintenanceReportOut.model_validate(report)


@router.patch("/reports/{report_id}/start", response_model=MaintenanceReportOut)
def start_report_work(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = db.query(MaintenanceReport).filter(MaintenanceReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="بلاغ الصيانة غير موجود")

    _can_work_on_report(current_user, report)

    if report.status in [MaintenanceStatus.completed, MaintenanceStatus.verified]:
        raise HTTPException(status_code=400, detail="لا يمكن بدء بلاغ مكتمل")

    report.status = MaintenanceStatus.in_progress
    if not report.started_at:
        report.started_at = _now_utc()

    if report.task_id:
        task = db.query(Task).filter(Task.id == report.task_id).first()
        if task and task.status == TaskStatus.pending:
            task.status = TaskStatus.in_progress

    db.commit()
    db.refresh(report)
    return MaintenanceReportOut.model_validate(report)


@router.patch("/reports/{report_id}/complete", response_model=MaintenanceReportOut)
def complete_report(
    report_id: int,
    req: MaintenanceCompleteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = db.query(MaintenanceReport).filter(MaintenanceReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="بلاغ الصيانة غير موجود")

    _can_work_on_report(current_user, report)

    if report.status == MaintenanceStatus.verified:
        raise HTTPException(status_code=400, detail="البلاغ تم التحقق منه بالفعل")

    if report.after_photo_url and report.after_photo_url != req.after_photo_url:
        _safe_delete_local_photo(report.after_photo_url)

    report.after_photo_url = req.after_photo_url
    report.status = MaintenanceStatus.completed
    report.completed_at = _now_utc()

    # Storage policy: remove local photos as soon as repair is marked complete.
    _safe_delete_local_photo(report.before_photo_url)
    _safe_delete_local_photo(report.after_photo_url)
    report.after_photo_url = None

    if report.task_id:
        task = db.query(Task).filter(Task.id == report.task_id).first()
        if task:
            task.status = TaskStatus.completed

    db.commit()
    db.refresh(report)
    return MaintenanceReportOut.model_validate(report)


@router.patch("/reports/{report_id}/before-photo", response_model=MaintenanceReportOut)
def replace_before_photo(
    report_id: int,
    req: MaintenancePhotoUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = db.query(MaintenanceReport).filter(MaintenanceReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="بلاغ الصيانة غير موجود")

    _can_work_on_report(current_user, report)

    if report.status == MaintenanceStatus.verified:
        raise HTTPException(status_code=400, detail="لا يمكن تعديل صورة بلاغ تم التحقق منه")

    if report.before_photo_url and report.before_photo_url != req.photo_url:
        _safe_delete_local_photo(report.before_photo_url)

    report.before_photo_url = req.photo_url
    db.commit()
    db.refresh(report)
    return MaintenanceReportOut.model_validate(report)


@router.delete("/reports/{report_id}")
def delete_report(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "supervisor", "superfv")),
):
    report = db.query(MaintenanceReport).filter(MaintenanceReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="بلاغ الصيانة غير موجود")

    check_hotel_access(current_user, report.hotel_id)

    _safe_delete_local_photo(report.before_photo_url)
    _safe_delete_local_photo(report.after_photo_url)

    room = db.query(Room).filter(Room.id == report.room_id).first()

    if report.task_id:
        task = db.query(Task).filter(Task.id == report.task_id).first()
        if task:
            db.delete(task)

    db.delete(report)

    if room and room.status == RoomStatus.maintenance:
        remaining_open_reports = (
            db.query(MaintenanceReport)
            .filter(
                MaintenanceReport.room_id == room.id,
                MaintenanceReport.id != report_id,
                MaintenanceReport.status.in_(
                    [
                        MaintenanceStatus.reported,
                        MaintenanceStatus.assigned,
                        MaintenanceStatus.in_progress,
                        MaintenanceStatus.waiting_parts,
                        MaintenanceStatus.completed,
                    ]
                ),
            )
            .count()
        )
        if remaining_open_reports == 0:
            room.status = RoomStatus.dirty

    db.commit()
    return {"detail": "تم حذف بلاغ الصيانة والصور المرتبطة به بنجاح"}


@router.patch("/reports/{report_id}/verify", response_model=MaintenanceReportOut)
def verify_report(
    report_id: int,
    req: MaintenanceVerifyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "supervisor", "superfv")),
):
    report = db.query(MaintenanceReport).filter(MaintenanceReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="بلاغ الصيانة غير موجود")

    check_hotel_access(current_user, report.hotel_id)

    if report.status != MaintenanceStatus.completed:
        raise HTTPException(status_code=400, detail="لا يمكن التحقق قبل اكتمال الإصلاح")

    try:
        final_room_status = RoomStatus(req.room_status)
    except ValueError:
        raise HTTPException(status_code=400, detail="حالة الغرفة النهائية غير صحيحة")

    if final_room_status not in [RoomStatus.ready, RoomStatus.dirty]:
        raise HTTPException(status_code=400, detail="عند الإغلاق يجب أن تكون الغرفة ready أو dirty")

    room = db.query(Room).filter(Room.id == report.room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="الغرفة غير موجودة")

    room.status = final_room_status

    report.status = MaintenanceStatus.verified
    report.verified_at = _now_utc()
    report.verified_by_id = current_user.id
    report.verification_notes = req.verification_notes
    report.closure_room_status = final_room_status.value

    _safe_delete_local_photo(report.before_photo_url)
    _safe_delete_local_photo(report.after_photo_url)
    report.after_photo_url = None

    if report.task_id:
        task = db.query(Task).filter(Task.id == report.task_id).first()
        if task:
            task.status = TaskStatus.closed

    db.commit()
    db.refresh(report)
    return MaintenanceReportOut.model_validate(report)


@router.get("/metrics/repair-time", response_model=MaintenanceMetricsOut)
def maintenance_metrics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(MaintenanceReport)

    role = current_user.role.value if hasattr(current_user.role, "value") else current_user.role
    if role != "admin":
        query = query.filter(MaintenanceReport.hotel_id == current_user.hotel_id)

    reports = query.all()

    total_reports = len(reports)
    open_reports = len([r for r in reports if r.status not in [MaintenanceStatus.completed, MaintenanceStatus.verified]])
    completed_reports = len([r for r in reports if r.status == MaintenanceStatus.completed])
    verified_reports = len([r for r in reports if r.status == MaintenanceStatus.verified])

    repair_durations = []
    for r in reports:
        if r.completed_at and r.reported_at:
            delta = r.completed_at - r.reported_at
            repair_durations.append(delta.total_seconds() / 60)

    avg_repair_minutes = None
    if repair_durations:
        avg_repair_minutes = round(sum(repair_durations) / len(repair_durations), 2)

    return MaintenanceMetricsOut(
        total_reports=total_reports,
        open_reports=open_reports,
        completed_reports=completed_reports,
        verified_reports=verified_reports,
        avg_repair_minutes=avg_repair_minutes,
    )
