from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from database import get_db
from models import User, UserRole, Hotel
from schemas.auth import LoginRequest, LoginResponse, UserOut, UserCreate, UserUpdate, UserSelfUpdate
from services.auth_service import authenticate_user, create_token, hash_password, verify_password
from middleware.auth import get_current_user, require_role

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
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)


@router.get("/users", response_model=list[UserOut])
def list_users(
    include_inactive: bool = False,
    hotel_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "supervisor")),
):
    """
    عرض المستخدمين
    - الإدارة العامة: تعرض جميع المستخدمين.
    - المشرف: يعرض مستخدمي فندقه فقط.
    """
    query = db.query(User)

    if not include_inactive:
        query = query.filter(User.is_active == True)
    
    if current_user.role.value == "supervisor":
        query = query.filter(User.hotel_id == current_user.hotel_id)
        if hotel_id is not None and hotel_id != current_user.hotel_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="لا تملك صلاحية عرض مستخدمي فندق آخر",
            )
    elif hotel_id is not None:
        query = query.filter(User.hotel_id == hotel_id)

    if current_user.role.value == "supervisor" and hotel_id is not None:
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

    db.commit()
    db.refresh(target)
    return UserOut.model_validate(target)
