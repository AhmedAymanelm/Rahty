from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from pathlib import Path
from urllib.parse import urlparse, unquote
from database import get_db
from models.user import User, UserRole
from models.task import Task, TaskPriority, TaskStatus
from models.task_message import TaskMessage
from models.maintenance import MaintenanceReport
from schemas.task import TaskCreate, TaskOut, TaskStatusUpdate, TaskMessageCreate, TaskMessageOut
from middleware.auth import get_current_user, require_role, check_hotel_access

router = APIRouter(prefix="/api/tasks", tags=["Tasks"])

MAINTENANCE_UPLOAD_DIR = Path(__file__).resolve().parents[1] / "uploads" / "maintenance"


def _extract_local_maintenance_upload_path(photo_url: str | None) -> Path | None:
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

    filename = Path(filename).name
    candidate = (MAINTENANCE_UPLOAD_DIR / filename).resolve()
    try:
        candidate.relative_to(MAINTENANCE_UPLOAD_DIR.resolve())
    except ValueError:
        return None
    return candidate


def _safe_delete_local_maintenance_photo(photo_url: str | None) -> None:
    path = _extract_local_maintenance_upload_path(photo_url)
    if not path:
        return
    try:
        if path.exists() and path.is_file():
            path.unlink()
    except OSError:
        return


def _can_access_task(current_user: User, task: Task) -> bool:
    role = current_user.role.value if hasattr(current_user.role, 'value') else current_user.role
    if role == "admin":
        return True
    if role in ["supervisor", "superfv"]:
        return current_user.hotel_id == task.hotel_id
    return task.assigned_to_id == current_user.id or task.creator_id == current_user.id


@router.post("", response_model=TaskOut)
def create_task(
    req: TaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "supervisor", "superfv", "cleaner", "maintenance")),
):
    """
    إنشاء مهمة جديدة.
    - الإدارة: يقدر يعين لأي فندق (يجب تحديد hotel_id)
    - المشرف/السوبرفايزر: تلقائياً يتم تعيين المهمة على نفس فندقه.
    """
    hotel_id = current_user.hotel_id
    if current_user.role.value == "admin":
        if not req.hotel_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="يجب على الإدارة تحديد الفندق",
            )
        hotel_id = req.hotel_id
    elif req.hotel_id and req.hotel_id != current_user.hotel_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="لا تملك صلاحية وضع مهام لفندق آخر",
            )

    try:
        priority = TaskPriority(req.priority)
    except ValueError:
        raise HTTPException(status_code=400, detail="أولوية غير صحيحة")

    if req.assigned_to_id is not None:
        assignee = db.query(User).filter(User.id == req.assigned_to_id, User.is_active == True).first()
        if not assignee:
            raise HTTPException(status_code=404, detail="الموظف المستلم غير موجود أو غير نشط")

        if assignee.hotel_id != hotel_id:
            raise HTTPException(
                status_code=400,
                detail="لا يمكن إسناد المهمة لموظف من فندق مختلف",
            )

    t = Task(
        title=req.title,
        description=req.description,
        priority=priority,
        status=TaskStatus.pending,
        hotel_id=hotel_id,
        creator_id=current_user.id,
        assigned_to_id=req.assigned_to_id,
        due_date=req.due_date,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return TaskOut.model_validate(t)


@router.get("", response_model=List[TaskOut])
def list_tasks(
    hotel_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    جلب المهام حسب الصلاحية:
    - المدير: يرى جميع المهام.
    - المشرف: يرى جميع مهام الفندق التابع له.
    - الموظف العادي: يرى المهام المسندة إليه فقط.
    """
    query = db.query(Task)
    role = current_user.role.value if hasattr(current_user.role, 'value') else current_user.role

    if role == "admin":
        if hotel_id is not None:
            query = query.filter(Task.hotel_id == hotel_id)
    elif role in ["supervisor", "superfv"]:
        query = query.filter(Task.hotel_id == current_user.hotel_id)
    else:
        # Worker level
        query = query.filter(Task.assigned_to_id == current_user.id)

    # Order by newest
    tasks = query.order_by(Task.created_at.desc()).all()
    return [TaskOut.model_validate(t) for t in tasks]


@router.patch("/{task_id}/status", response_model=TaskOut)
def update_task_status(
    task_id: int,
    req: TaskStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """تحديث حالة المهمة"""
    t = db.query(Task).filter(Task.id == task_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="المهمة غير موجودة")

    # Authorize
    role = current_user.role.value if hasattr(current_user.role, 'value') else current_user.role
    if role != "admin":
        check_hotel_access(current_user, t.hotel_id)
        if role not in ["supervisor", "superfv"] and t.assigned_to_id != current_user.id:
            raise HTTPException(status_code=403, detail="هذه المهمة غير مسندة إليك")

    try:
        new_status = TaskStatus(req.status)
    except ValueError:
        raise HTTPException(status_code=400, detail="حالة غير صحيحة")

    # Business Logic Restrictions
    if role not in ["admin", "supervisor", "superfv"]:
        if new_status == TaskStatus.closed:
            raise HTTPException(status_code=403, detail="المشرف فقط يمكنه إغلاق المهمة نهائياً")

    # Product decision: completing a task should close it immediately.
    if new_status == TaskStatus.completed:
        t.status = TaskStatus.closed
    else:
        t.status = new_status

    # If this task is linked to a maintenance report, purge local photos on close.
    if t.status == TaskStatus.closed:
        report = db.query(MaintenanceReport).filter(MaintenanceReport.task_id == t.id).first()
        if report:
            _safe_delete_local_maintenance_photo(report.before_photo_url)
            _safe_delete_local_maintenance_photo(report.after_photo_url)
            report.after_photo_url = None

    db.commit()
    db.refresh(t)
    return TaskOut.model_validate(t)


@router.get("/{task_id}/messages", response_model=List[TaskMessageOut])
def list_task_messages(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="المهمة غير موجودة")

    if not _can_access_task(current_user, task):
        raise HTTPException(status_code=403, detail="لا تملك صلاحية الوصول لمحادثة هذه المهمة")

    rows = (
        db.query(TaskMessage)
        .filter(TaskMessage.task_id == task_id)
        .order_by(TaskMessage.created_at.asc())
        .all()
    )

    return [
        TaskMessageOut(
            id=row.id,
            task_id=row.task_id,
            sender_id=row.sender_id,
            sender_full_name=row.sender.full_name if row.sender else f"User {row.sender_id}",
            message=row.message,
            created_at=row.created_at,
        )
        for row in rows
    ]


@router.post("/{task_id}/messages", response_model=TaskMessageOut)
def send_task_message(
    task_id: int,
    req: TaskMessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="المهمة غير موجودة")

    if not _can_access_task(current_user, task):
        raise HTTPException(status_code=403, detail="لا تملك صلاحية الوصول لمحادثة هذه المهمة")

    text = (req.message or "").strip()
    if len(text) < 1:
        raise HTTPException(status_code=400, detail="نص الرسالة مطلوب")
    if len(text) > 2000:
        raise HTTPException(status_code=400, detail="الرسالة طويلة جداً")

    row = TaskMessage(
        task_id=task_id,
        sender_id=current_user.id,
        message=text,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    return TaskMessageOut(
        id=row.id,
        task_id=row.task_id,
        sender_id=row.sender_id,
        sender_full_name=current_user.full_name,
        message=row.message,
        created_at=row.created_at,
    )
