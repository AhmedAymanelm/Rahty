from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from models.user import User, UserRole
from models.room_type import RoomType
from models.hotel import Hotel
from schemas.room_type import RoomTypeCreate, RoomTypeUpdate, RoomTypeOut
from middleware.auth import get_current_user

router = APIRouter(prefix="/api/room-types", tags=["Room Types"])

def require_admin(current_user: User = Depends(get_current_user)):
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Not enough privileges")
    return current_user

@router.get("", response_model=List[RoomTypeOut])
def get_room_types(
    hotel_id: int = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(RoomType, Hotel.name.label("hotel_name")).join(Hotel, Hotel.id == RoomType.hotel_id)
    
    # Non-admin users: always scope to their hotel
    if current_user.role != UserRole.admin:
        target_id = current_user.hotel_id or hotel_id
        if target_id:
            query = query.filter(RoomType.hotel_id == target_id)
    else:
        # Admin: filter by hotel_id query param if provided, else return all
        if hotel_id:
            query = query.filter(RoomType.hotel_id == hotel_id)

    rows = query.all()
    
    result = []
    for rt, hotel_name in rows:
        out = RoomTypeOut.from_orm(rt)
        out.hotel_name = hotel_name
        result.append(out)
    return result

@router.post("", response_model=RoomTypeOut)
def create_room_type(
    req: RoomTypeCreate,
    hotel_id: int = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    target_hotel_id = hotel_id or current_user.hotel_id
    if not target_hotel_id:
        first_hotel = db.query(Hotel).first()
        if not first_hotel:
            raise HTTPException(status_code=400, detail="لا يوجد فندق مسجل في النظام")
        target_hotel_id = first_hotel.id

    existing = db.query(RoomType).filter(
        RoomType.hotel_id == target_hotel_id,
        RoomType.name == req.name
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="اسم نوع الغرفة موجود مسبقاً في هذا الفندق")

    new_rt = RoomType(
        hotel_id=target_hotel_id,
        name=req.name,
        base_price=req.base_price,
        capacity=req.capacity,
        area=req.area,
        is_active=req.is_active
    )
    db.add(new_rt)
    db.commit()
    db.refresh(new_rt)

    hotel = db.query(Hotel).filter(Hotel.id == new_rt.hotel_id).first()
    out = RoomTypeOut.from_orm(new_rt)
    out.hotel_name = hotel.name if hotel else ""
    return out

@router.patch("/{rt_id}", response_model=RoomTypeOut)
def update_room_type(
    rt_id: int,
    req: RoomTypeUpdate,
    hotel_id: int = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    query = db.query(RoomType).filter(RoomType.id == rt_id)
    if current_user.hotel_id:
        query = query.filter(RoomType.hotel_id == current_user.hotel_id)
    
    rt = query.first()
    if not rt:
        raise HTTPException(status_code=404, detail="نوع الغرفة غير موجود")
        
    target_hotel_id = hotel_id or rt.hotel_id

    if req.name is not None:
        clash = db.query(RoomType).filter(
            RoomType.hotel_id == target_hotel_id,
            RoomType.name == req.name,
            RoomType.id != rt_id
        ).first()
        if clash:
            raise HTTPException(status_code=400, detail="الاسم موجود مسبقاً في الفندق المختار")
        rt.name = req.name
        
    if hotel_id is not None and not current_user.hotel_id:
        rt.hotel_id = hotel_id
        
    if req.base_price is not None: rt.base_price = req.base_price
    if req.capacity is not None:   rt.capacity   = req.capacity
    if req.area is not None:       rt.area       = req.area
    if req.is_active is not None:  rt.is_active  = req.is_active

    db.commit()
    db.refresh(rt)

    hotel = db.query(Hotel).filter(Hotel.id == rt.hotel_id).first()
    out = RoomTypeOut.from_orm(rt)
    out.hotel_name = hotel.name if hotel else ""
    return out

@router.delete("/{rt_id}")
def delete_room_type(
    rt_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    query = db.query(RoomType).filter(RoomType.id == rt_id)
    if current_user.hotel_id:
        query = query.filter(RoomType.hotel_id == current_user.hotel_id)
        
    rt = query.first()
    if not rt:
        raise HTTPException(status_code=404, detail="نوع الغرفة غير موجود")
        
    db.delete(rt)
    db.commit()
    return {"message": "تم الحذف بنجاح"}
