from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from database import get_db
from models.room import Room, RoomStatus
from models.hotel import Hotel
from schemas.room import RoomCreate, RoomOut, RoomStatusUpdate
from middleware.auth import get_current_user, check_hotel_access, require_role

router = APIRouter(prefix="/api/rooms", tags=["Rooms"])


@router.post("", response_model=RoomOut, status_code=status.HTTP_201_CREATED)
def create_room(
    req: RoomCreate,
    db: Session = Depends(get_db),
    current_user = Depends(require_role("admin", "supervisor", "superfv")),
):
    """
    إضافة غرفة جديدة حسب الصلاحيات:
    - admin: يمكنه الإضافة لأي فندق.
    - supervisor/superfv: يمكنهم الإضافة لفندقهم فقط.
    """
    role = current_user.role.value if hasattr(current_user.role, 'value') else current_user.role

    if role in ["supervisor", "superfv"] and req.hotel_id != current_user.hotel_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="لا تملك صلاحية إضافة غرفة لفندق آخر",
        )

    hotel = db.query(Hotel).filter(Hotel.id == req.hotel_id).first()
    if not hotel:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="الفندق غير موجود")

    existing = (
        db.query(Room)
        .filter(Room.hotel_id == req.hotel_id, Room.number == req.number)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="رقم الغرفة موجود بالفعل في هذا الفندق",
        )

    try:
        initial_status = RoomStatus(req.status)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="حالة الغرفة غير صحيحة")

    room = Room(
        number=req.number.strip(),
        floor=req.floor,
        room_type=req.room_type.strip() if req.room_type else "Single",
        status=initial_status,
        hotel_id=req.hotel_id,
    )

    db.add(room)
    db.commit()
    db.refresh(room)
    return room


@router.get("", response_model=List[RoomOut])
def list_rooms(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """
    جلب القائمة بناءً على الصلاحيات:
    - المدير: يرى جميع الغرف (يفضل تمرير hotel_id كمحدد).
    - المشرف/الموظف: يرى غرف فندقه فقط.
    """
    query = db.query(Room)
    role = current_user.role.value if hasattr(current_user.role, 'value') else current_user.role
    
    if role != "admin":
        query = query.filter(Room.hotel_id == current_user.hotel_id)
        
    return query.order_by(Room.number).all()


@router.patch("/{room_id}/status", response_model=RoomOut)
def update_room_status(
    room_id: int,
    req: RoomStatusUpdate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """تحديث حالة الغرفة (نظيفة، متسخة، صيانة، إلخ)"""
    room = db.query(Room).filter(Room.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="الغرفة غير موجودة")

    # Authorize
    check_hotel_access(current_user, room.hotel_id)

    try:
        new_status = RoomStatus(req.status)
    except ValueError:
        raise HTTPException(status_code=400, detail="حالة غير صحيحة")

    room.status = new_status
    db.commit()
    db.refresh(room)
    return room
