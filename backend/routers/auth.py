from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func as sa_func
from database import get_db
from models import User, UserRole, Hotel
from models.task import Task, TaskStatus
from models.task_message import TaskMessage
from models.warning import EmployeeWarning, WarningType
from models.leave_request import LeaveRequest, LeaveType, LeaveStatus
from models.attendance import AttendanceSession
from models.direct_message import DirectMessage
from schemas.auth import LoginRequest, LoginResponse, UserOut, UserCreate, UserUpdate, UserSelfUpdate
from schemas.employee_profile import (
    EmployeeProfileOut, ProfileTaskOut, ProfileConversationOut,
    WarningOut, LeaveRequestOut, PerformanceMetrics,
    DirectMessageOut, DirectMessageCreate, GlobalWarningOut, GlobalLeaveOut
)
from services.auth_service import authenticate_user, create_token, hash_password, verify_password
from middleware.auth import get_current_user, require_role
from datetime import date, datetime
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post("/login", response_model=LoginResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    """تسجيل الدخول — يرجع JWT token بدون انتهاء صلاحية"""
    user = authenticate_user(db, req.username, req.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="اسم المستخدم أو كلمة المرور غير صحيحة",
        )
    token = create_token(user)
    return LoginResponse(
        access_token=token,
        user=UserOut.model_validate(user),
    )


@router.get("/me", response_model=UserOut)
def get_me(user: User = Depends(get_current_user)):
    """الحصول على بيانات المستخدم الحالي"""
    return UserOut.model_validate(user)


@router.patch("/me", response_model=UserOut)
def update_me(
    req: UserSelfUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    payload = req.model_dump(exclude_unset=True)
    if not payload:
        raise HTTPException(status_code=400, detail="لا توجد بيانات للتعديل")

    requested_username_change = (
        "username" in payload
        and payload["username"] is not None
        and payload["username"].strip() != current_user.username
    )

    requested_full_name_change = (
        "full_name" in payload
        and payload["full_name"] is not None
        and payload["full_name"].strip() != (current_user.full_name or "")
    )

    if requested_full_name_change:
        raise HTTPException(status_code=403, detail="تغيير الاسم الكامل غير مسموح")
    requested_password_change = (
        "new_password" in payload
        and payload["new_password"] is not None
        and payload["new_password"].strip() != ""
    )

    if requested_username_change or requested_password_change:
        current_password = (payload.get("current_password") or "").strip()
        if not current_password:
            raise HTTPException(status_code=400, detail="يرجى إدخال كلمة المرور الحالية")
        if not verify_password(current_password, current_user.password_hash):
            raise HTTPException(status_code=401, detail="كلمة المرور الحالية غير صحيحة")

    if "new_password" in payload and payload["new_password"] is not None:
        new_password = payload["new_password"].strip()
        if len(new_password) < 6:
            raise HTTPException(status_code=400, detail="كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل")
        current_user.password_hash = hash_password(new_password)

    if "username" in payload and payload["username"] is not None:
        username = payload["username"].strip()
        if len(username) < 3:
            raise HTTPException(status_code=400, detail="اسم المستخدم يجب أن يكون 3 أحرف على الأقل")
        if username != current_user.username:
            exists = db.query(User).filter(User.username == username, User.id != current_user.id).first()
            if exists:
                raise HTTPException(status_code=400, detail="اسم المستخدم مستخدم بالفعل")
            current_user.username = username

    db.commit()
    db.refresh(current_user)
    return UserOut.model_validate(current_user)


@router.post("/register", response_model=UserOut)
def register(
    req: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "supervisor")),
):
    """
    تسجيل مستخدم جديد
    - الإدارة العامة: تستطيع تعيين أي شخص لأي فندق.
    - المشرف: يستطيع تعيين (عمال، فنيين، استقبال) في فندقه فقط.
    """
    # Check if username exists
    existing = db.query(User).filter(User.username == req.username).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="اسم المستخدم مستخدم بالفعل",
        )

    # Validate role
    try:
        role = UserRole(req.role)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"دور غير صالح: {req.role}",
        )
        
    # Role-based validation
    if current_user.role.value == "supervisor":
        # Supervisors can only assign to their hotel
        if req.hotel_id != current_user.hotel_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="لا تملك صلاحية إضافة مستخدمين لفروع أخرى",
            )
        # Supervisors cannot create admins or other supervisors
        if role in [UserRole.admin, UserRole.supervisor]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="لا تملك صلاحية إنشاء إدارة أو مشرفين",
            )

    user = User(
        username=req.username,
        password_hash=hash_password(req.password),
        full_name=req.full_name,
        role=role,
        hotel_id=req.hotel_id,
        national_id=req.national_id,
        phone_number=req.phone_number,
        email=req.email,
        hiring_date=req.hiring_date,
        contract_type=req.contract_type,
        basic_salary=req.basic_salary,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """
    حذف مستخدم النهائي من النظام (صلاحية الإدارة العامة فقط).
    """
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")

    if target.id == current_user.id:
        raise HTTPException(status_code=400, detail="لا يمكنك حذف حسابك الخاص")

    db.delete(target)
    db.commit()
    return None

@router.get("/users", response_model=list[UserOut])
def list_users(
    include_inactive: bool = False,
    hotel_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    عرض المستخدمين
    - الإدارة العامة: تعرض جميع المستخدمين.
    - الموظفين العاديين: يعرض مستخدمي فندقهم فقط وموظفي الإدارة.
    """
    from sqlalchemy import or_
    query = db.query(User)

    if not include_inactive:
        query = query.filter(User.is_active == True)
    
    if current_user.role.value != "admin":
        # All non-admins see only their hotel OR admins
        query = query.filter(
            or_(
                User.hotel_id == current_user.hotel_id,
                User.role == "admin"
            )
        )
        if hotel_id is not None and hotel_id != current_user.hotel_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="لا تملك صلاحية عرض مستخدمي فندق آخر",
            )
    elif hotel_id is not None:
        # Admin filtering by hotel
        query = query.filter(User.hotel_id == hotel_id)
        
    users = query.all()
    return [UserOut.model_validate(u) for u in users]


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    req: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "supervisor")),
):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")

    actor_role = current_user.role.value
    payload = req.model_dump(exclude_unset=True)
    if not payload:
        raise HTTPException(status_code=400, detail="لا توجد بيانات للتعديل")

    # Supervisors can only edit users in their own hotel and cannot edit admin/supervisor roles.
    if actor_role == "supervisor":
        if target.hotel_id != current_user.hotel_id:
            raise HTTPException(status_code=403, detail="لا تملك صلاحية تعديل مستخدمي فروع أخرى")
        if target.role in [UserRole.admin, UserRole.supervisor]:
            raise HTTPException(status_code=403, detail="لا يمكنك تعديل حساب إدارة أو مشرف")

    if "role" in payload and payload["role"] is not None:
        try:
            new_role = UserRole(payload["role"])
        except ValueError:
            raise HTTPException(status_code=400, detail="دور غير صالح")

        if actor_role == "supervisor" and new_role in [UserRole.admin, UserRole.supervisor]:
            raise HTTPException(status_code=403, detail="لا يمكنك ترقية المستخدم إلى إدارة أو مشرف")
        target.role = new_role

    if "hotel_id" in payload:
        new_hotel_id = payload["hotel_id"]
        if new_hotel_id is not None:
            hotel_exists = db.query(Hotel).filter(Hotel.id == new_hotel_id).first()
            if not hotel_exists:
                raise HTTPException(status_code=400, detail="الفندق المحدد غير موجود")

        if actor_role == "supervisor" and new_hotel_id != current_user.hotel_id:
            raise HTTPException(status_code=403, detail="لا يمكنك نقل المستخدم إلى فندق آخر")

        target.hotel_id = new_hotel_id

    if "full_name" in payload and payload["full_name"] is not None:
        name = payload["full_name"].strip()
        if len(name) < 2:
            raise HTTPException(status_code=400, detail="الاسم الكامل قصير جداً")
        target.full_name = name

    if "is_active" in payload and payload["is_active"] is not None:
        target.is_active = payload["is_active"]

    # New detailed profile fields
    for field in ["national_id", "phone_number", "email", "hiring_date", "contract_type", "basic_salary"]:
        if field in payload and payload[field] is not None:
            # For empty strings in optional fields, keep as empty or map to None if it makes sense
            # But the schema allows empty string, let's keep it direct. 
            # Oh, basic_salary might be sent as string, pydantic handles float conversion.
            setattr(target, field, payload[field])

    db.commit()
    db.refresh(target)
    return UserOut.model_validate(target)


# ============================================================
#  Employee Profile — ملف الموظف الكامل
# ============================================================

@router.get("/users/{user_id}/profile", response_model=EmployeeProfileOut)
def get_employee_profile(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "supervisor")),
):
    """عرض ملف الموظف الكامل بجميع بياناته (مهام، محادثات، إنذارات، إجازات، أداء)"""
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")

    # Authorization check for supervisors
    if current_user.role.value == "supervisor":
        if target.hotel_id != current_user.hotel_id:
            raise HTTPException(status_code=403, detail="لا تملك صلاحية عرض بيانات موظفي فروع أخرى")

    hotel_name = target.hotel.name if target.hotel else None

    # --- Tasks ---
    tasks_query = db.query(Task).filter(Task.assigned_to_id == user_id).order_by(Task.created_at.desc()).all()
    tasks = []
    for t in tasks_query:
        tasks.append(ProfileTaskOut(
            id=t.id,
            title=t.title,
            priority=t.priority.value if hasattr(t.priority, 'value') else t.priority,
            status=t.status.value if hasattr(t.status, 'value') else t.status,
            hotel_name=t.hotel.name if t.hotel else None,
            creator_name=t.creator.full_name if t.creator else None,
            due_date=t.due_date,
            created_at=t.created_at,
        ))

    # --- Conversations (grouped by task) ---
    conversations = []
    user_task_ids = [t.id for t in tasks_query]
    if user_task_ids:
        # Get tasks where user has messages
        msg_task_ids = (
            db.query(TaskMessage.task_id)
            .filter(TaskMessage.sender_id == user_id)
            .distinct()
            .all()
        )
        all_conv_task_ids = list(set(user_task_ids + [r[0] for r in msg_task_ids]))

        for tid in all_conv_task_ids:
            task_obj = db.query(Task).filter(Task.id == tid).first()
            if not task_obj:
                continue
            msg_count = db.query(TaskMessage).filter(TaskMessage.task_id == tid).count()
            last_msg = (
                db.query(TaskMessage)
                .filter(TaskMessage.task_id == tid)
                .order_by(TaskMessage.created_at.desc())
                .first()
            )
            if last_msg and msg_count > 0:
                conversations.append(ProfileConversationOut(
                    task_id=tid,
                    task_title=task_obj.title,
                    last_message=last_msg.message[:100],
                    last_message_at=last_msg.created_at,
                    message_count=msg_count,
                ))

    # --- Warnings ---
    warnings_query = (
        db.query(EmployeeWarning)
        .filter(EmployeeWarning.user_id == user_id)
        .order_by(EmployeeWarning.created_at.desc())
        .all()
    )
    warnings = []
    for w in warnings_query:
        warnings.append(WarningOut(
            id=w.id,
            warning_type=w.warning_type.value if hasattr(w.warning_type, 'value') else w.warning_type,
            reason=w.reason,
            notes=w.notes,
            issued_by_name=w.issued_by.full_name if w.issued_by else "—",
            created_at=w.created_at,
        ))

    # --- Leaves ---
    leaves_query = (
        db.query(LeaveRequest)
        .filter(LeaveRequest.user_id == user_id)
        .order_by(LeaveRequest.created_at.desc())
        .all()
    )
    leaves = []
    for lv in leaves_query:
        leaves.append(LeaveRequestOut(
            id=lv.id,
            leave_type=lv.leave_type.value if hasattr(lv.leave_type, 'value') else lv.leave_type,
            start_date=lv.start_date,
            end_date=lv.end_date,
            reason=lv.reason,
            status=lv.status.value if hasattr(lv.status, 'value') else lv.status,
            reviewed_by_name=lv.reviewed_by.full_name if lv.reviewed_by else None,
            review_notes=lv.review_notes,
            created_at=lv.created_at,
        ))

    # --- Performance ---
    total_tasks = len(tasks_query)
    completed = sum(1 for t in tasks_query if (t.status.value if hasattr(t.status, 'value') else t.status) in ["completed", "closed"])
    pending = sum(1 for t in tasks_query if (t.status.value if hasattr(t.status, 'value') else t.status) == "pending")
    in_progress = sum(1 for t in tasks_query if (t.status.value if hasattr(t.status, 'value') else t.status) == "in_progress")
    completion_rate = round((completed / total_tasks * 100), 1) if total_tasks > 0 else 0.0

    attendance_days = db.query(AttendanceSession).filter(AttendanceSession.user_id == user_id).count()
    approved_leaves = sum(1 for lv in leaves_query if (lv.status.value if hasattr(lv.status, 'value') else lv.status) == "approved")

    performance = PerformanceMetrics(
        total_tasks=total_tasks,
        completed_tasks=completed,
        pending_tasks=pending,
        in_progress_tasks=in_progress,
        completion_rate=completion_rate,
        total_warnings=len(warnings_query),
        total_leaves=len(leaves_query),
        approved_leaves=approved_leaves,
        attendance_days=attendance_days,
    )

    return EmployeeProfileOut(
        id=target.id,
        username=target.username,
        full_name=target.full_name,
        role=target.role.value if hasattr(target.role, 'value') else target.role,
        hotel_id=target.hotel_id,
        hotel_name=hotel_name,
        is_active=target.is_active if target.is_active is not None else True,
        created_at=target.created_at,
        national_id=target.national_id,
        phone_number=target.phone_number,
        email=target.email,
        hiring_date=target.hiring_date,
        contract_type=target.contract_type,
        basic_salary=float(target.basic_salary) if target.basic_salary is not None else None,
        tasks=tasks,
        conversations=conversations,
        warnings=warnings,
        leaves=leaves,
        performance=performance,
    )


# ============================================================
#  Warnings — الإنذارات
# ============================================================

class WarningCreate(BaseModel):
    user_id: int
    warning_type: str = "verbal"
    reason: str
    notes: Optional[str] = None


@router.post("/warnings", response_model=WarningOut)
def create_warning(
    req: WarningCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "supervisor")),
):
    """إصدار إنذار لموظف"""
    target_user = db.query(User).filter(User.id == req.user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")

    if current_user.role.value == "supervisor":
        if target_user.hotel_id != current_user.hotel_id:
            raise HTTPException(status_code=403, detail="لا تملك صلاحية إنذار موظفي فروع أخرى")
        if target_user.role in [UserRole.admin, UserRole.supervisor]:
            raise HTTPException(status_code=403, detail="لا يمكنك إنذار مدير أو مشرف")

    try:
        wtype = WarningType(req.warning_type)
    except ValueError:
        raise HTTPException(status_code=400, detail="نوع الإنذار غير صالح")

    warning = EmployeeWarning(
        user_id=req.user_id,
        issued_by_id=current_user.id,
        hotel_id=target_user.hotel_id or current_user.hotel_id,
        warning_type=wtype,
        reason=req.reason,
        notes=req.notes,
    )
    db.add(warning)
    db.commit()
    db.refresh(warning)

    return WarningOut(
        id=warning.id,
        warning_type=warning.warning_type.value,
        reason=warning.reason,
        notes=warning.notes,
        issued_by_name=current_user.full_name,
        created_at=warning.created_at,
    )


# ============================================================
#  Leave Requests — الإجازات
# ============================================================

class LeaveRequestCreate(BaseModel):
    user_id: int
    leave_type: str = "annual"
    start_date: date
    end_date: date
    reason: Optional[str] = None


class LeaveReviewRequest(BaseModel):
    status: str  # approved / rejected
    review_notes: Optional[str] = None


@router.post("/leaves", response_model=LeaveRequestOut)
def create_leave_request(
    req: LeaveRequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "supervisor")),
):
    """تسجيل طلب إجازة لموظف"""
    target_user = db.query(User).filter(User.id == req.user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")

    if req.start_date > req.end_date:
        raise HTTPException(status_code=400, detail="تاريخ البداية يجب أن يكون قبل تاريخ النهاية")

    try:
        ltype = LeaveType(req.leave_type)
    except ValueError:
        raise HTTPException(status_code=400, detail="نوع الإجازة غير صالح")

    leave = LeaveRequest(
        user_id=req.user_id,
        hotel_id=target_user.hotel_id or current_user.hotel_id,
        leave_type=ltype,
        start_date=req.start_date,
        end_date=req.end_date,
        reason=req.reason,
        status=LeaveStatus.pending,
    )
    db.add(leave)
    db.commit()
    db.refresh(leave)

    return LeaveRequestOut(
        id=leave.id,
        leave_type=leave.leave_type.value,
        start_date=leave.start_date,
        end_date=leave.end_date,
        reason=leave.reason,
        status=leave.status.value,
        reviewed_by_name=None,
        review_notes=None,
        created_at=leave.created_at,
    )


@router.patch("/leaves/{leave_id}/review", response_model=LeaveRequestOut)
def review_leave_request(
    leave_id: int,
    req: LeaveReviewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "supervisor")),
):
    """قبول أو رفض طلب إجازة"""
    leave = db.query(LeaveRequest).filter(LeaveRequest.id == leave_id).first()
    if not leave:
        raise HTTPException(status_code=404, detail="طلب الإجازة غير موجود")

    try:
        new_status = LeaveStatus(req.status)
    except ValueError:
        raise HTTPException(status_code=400, detail="حالة غير صالحة")

    if new_status not in [LeaveStatus.approved, LeaveStatus.rejected]:
        raise HTTPException(status_code=400, detail="يجب اختيار قبول أو رفض")

    leave.status = new_status
    leave.reviewed_by_id = current_user.id
    leave.review_notes = req.review_notes

    db.commit()
    db.refresh(leave)

    return LeaveRequestOut(
        id=leave.id,
        leave_type=leave.leave_type.value,
        start_date=leave.start_date,
        end_date=leave.end_date,
        reason=leave.reason,
        status=leave.status.value,
        reviewed_by_name=current_user.full_name,
        review_notes=leave.review_notes,
        created_at=leave.created_at,
    )

@router.get("/warnings", response_model=list[GlobalWarningOut])
def get_all_warnings(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "supervisor")),
):
    """عرض جميع الإنذارات لجميع الموظفين"""
    query = db.query(EmployeeWarning).join(User, EmployeeWarning.user_id == User.id)
    if current_user.role.value == "supervisor":
        query = query.filter(User.hotel_id == current_user.hotel_id)
        
    warnings = query.order_by(EmployeeWarning.created_at.desc()).all()
    
    out = []
    for w in warnings:
        out.append(GlobalWarningOut(
            id=w.id,
            warning_type=w.warning_type.value if hasattr(w.warning_type, 'value') else w.warning_type,
            reason=w.reason,
            notes=w.notes,
            issued_by_name=w.issued_by.full_name if w.issued_by else "—",
            created_at=w.created_at,
            user_id=w.user.id,
            user_name=w.user.full_name,
            hotel_name=w.user.hotel.name if w.user.hotel else "إدارة عامة"
        ))
    return out


@router.get("/leaves", response_model=list[GlobalLeaveOut])
def get_all_leaves(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "supervisor")),
):
    """عرض جميع الإجازات لجميع الموظفين"""
    query = db.query(LeaveRequest).join(User, LeaveRequest.user_id == User.id)
    if current_user.role.value == "supervisor":
        query = query.filter(User.hotel_id == current_user.hotel_id)
        
    leaves = query.order_by(LeaveRequest.created_at.desc()).all()
    
    out = []
    for lv in leaves:
        out.append(GlobalLeaveOut(
            id=lv.id,
            leave_type=lv.leave_type.value if hasattr(lv.leave_type, 'value') else lv.leave_type,
            start_date=lv.start_date,
            end_date=lv.end_date,
            reason=lv.reason,
            status=lv.status.value if hasattr(lv.status, 'value') else lv.status,
            reviewed_by_name=lv.reviewed_by.full_name if lv.reviewed_by else None,
            review_notes=lv.review_notes,
            created_at=lv.created_at,
            user_id=lv.user.id,
            user_name=lv.user.full_name,
            hotel_name=lv.user.hotel.name if lv.user.hotel else "إدارة عامة"
        ))
    return out

# ============================================================
#  Direct Messages — المحادثات المباشرة
# ============================================================

@router.get("/users/{user_id}/messages", response_model=list[DirectMessageOut])
def get_user_messages(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """جلب سجل المحادثات الخاصة مع موظف معين"""
    from sqlalchemy import or_, and_

    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")

    if current_user.role.value != "admin" and target_user.hotel_id != current_user.hotel_id and target_user.role.value != "admin":
        raise HTTPException(status_code=403, detail="لا تملك صلاحية الوصول لموظفي فروع أخرى")

    messages = (
        db.query(DirectMessage)
        .filter(
            or_(
                and_(DirectMessage.sender_id == current_user.id, DirectMessage.receiver_id == user_id),
                and_(DirectMessage.sender_id == user_id, DirectMessage.receiver_id == current_user.id),
            )
        )
        .order_by(DirectMessage.created_at.asc())
        .all()
    )

    out = []
    for m in messages:
        sender_name = m.sender.full_name if m.sender else "—"
        out.append(DirectMessageOut(
            id=m.id,
            sender_id=m.sender_id,
            receiver_id=m.receiver_id,
            message=m.message,
            is_read=m.is_read,
            created_at=m.created_at,
            sender_name=sender_name
        ))
    return out


@router.post("/users/{user_id}/messages", response_model=DirectMessageOut)
def send_user_message(
    user_id: int,
    req: DirectMessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """إرسال رسالة مباشرة للموظف"""
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")

    if current_user.role.value != "admin" and target_user.hotel_id != current_user.hotel_id and target_user.role.value != "admin":
        raise HTTPException(status_code=403, detail="لا تملك صلاحية المراسلة لموظفي فروع أخرى")
        
    msg = DirectMessage(
        sender_id=current_user.id,
        receiver_id=user_id,
        message=req.message,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)

    return DirectMessageOut(
        id=msg.id,
        sender_id=msg.sender_id,
        receiver_id=msg.receiver_id,
        message=msg.message,
        is_read=msg.is_read,
        created_at=msg.created_at,
        sender_name=current_user.full_name
    )


@router.get("/messages/inbox")
def get_inbox_unread(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """جلب قائمة المُرسِلين الذين لديهم رسائل غير مقروءة للمستخدم الحالي"""
    unread = (
        db.query(DirectMessage.sender_id, sa_func.count(DirectMessage.id).label('count'))
        .filter(
            DirectMessage.receiver_id == current_user.id,
            DirectMessage.is_read == False,
        )
        .group_by(DirectMessage.sender_id)
        .all()
    )
    return [{"sender_id": row.sender_id, "count": row.count} for row in unread]


@router.post("/users/{user_id}/messages/read")
def mark_messages_read(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """تعليم جميع الرسائل من موظف معين كمقروءة"""
    db.query(DirectMessage).filter(
        DirectMessage.sender_id == user_id,
        DirectMessage.receiver_id == current_user.id,
        DirectMessage.is_read == False,
    ).update({"is_read": True})
    db.commit()
    return {"status": "ok"}


@router.get("/messages/threads")
def get_all_threads(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """جلب قائمة كل المحادثات النشطة مع آخر رسالة لكل محادثة"""
    from sqlalchemy import or_, and_, desc

    # Get all messages involving current user
    all_msgs = (
        db.query(DirectMessage)
        .filter(
            or_(
                DirectMessage.sender_id == current_user.id,
                DirectMessage.receiver_id == current_user.id,
            )
        )
        .order_by(DirectMessage.created_at.desc())
        .all()
    )

    # Build thread map: other_user_id -> { last_message, unread_count }
    seen = set()
    threads = []
    for m in all_msgs:
        other_id = m.receiver_id if m.sender_id == current_user.id else m.sender_id
        if other_id in seen:
            continue
        seen.add(other_id)

        other_user = db.query(User).filter(User.id == other_id).first()
        if not other_user:
            continue

        unread_count = db.query(DirectMessage).filter(
            DirectMessage.sender_id == other_id,
            DirectMessage.receiver_id == current_user.id,
            DirectMessage.is_read == False,
        ).count()

        threads.append({
            "user_id": other_user.id,
            "full_name": other_user.full_name,
            "role": other_user.role.value if hasattr(other_user.role, 'value') else other_user.role,
            "hotel_name": other_user.hotel.name if other_user.hotel else "الإدارة العامة",
            "hotel_id": other_user.hotel_id,
            "last_message": m.message,
            "last_message_time": m.created_at.isoformat(),
            "is_last_mine": m.sender_id == current_user.id,
            "unread_count": unread_count,
        })

    return threads


