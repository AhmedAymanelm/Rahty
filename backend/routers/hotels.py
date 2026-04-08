from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from database import get_db
from models.hotel import Hotel
from schemas.auth import HotelOut, HotelCreate, HotelUpdate
from middleware.auth import get_current_user, require_role
from models.user import User

router = APIRouter(prefix="/api/hotels", tags=["Hotels"])


@router.get("", response_model=list[HotelOut])
def list_hotels(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    جلب قائمة الفنادق
    - المدير: يرى جميع الفنادق
    - المشرف/الموظف: يرى فقط الفندق التابع له
    """
    user_role = current_user.role.value if hasattr(current_user.role, 'value') else current_user.role

    if user_role == "admin":
        hotels = db.query(Hotel).order_by(Hotel.id.asc()).all()
    else:
        hotels = db.query(Hotel).filter(Hotel.id == current_user.hotel_id).all()

    return hotels


@router.post("", response_model=HotelOut, status_code=status.HTTP_201_CREATED)
def create_hotel(
    req: HotelCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """إنشاء فندق جديد — صلاحية الإدارة العامة فقط"""
    hotel = Hotel(
        name=req.name,
        city=req.city,
        address=req.address,
        location=f"{req.city or ''} - {req.address or ''}".strip(" -"),
        phone=req.phone,
        total_rooms=req.total_rooms or 0,
        total_floors=req.total_floors or 0,
        stars=req.stars or 3,
        description=req.description,
        manager_id=req.manager_id,
    )
    db.add(hotel)
    db.commit()
    db.refresh(hotel)
    return hotel


@router.patch("/{hotel_id}", response_model=HotelOut)
def update_hotel(
    hotel_id: int,
    req: HotelUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """تحديث بيانات الفندق — صلاحية الإدارة العامة فقط"""
    hotel = db.query(Hotel).filter(Hotel.id == hotel_id).first()
    if not hotel:
        raise HTTPException(status_code=404, detail="الفندق غير موجود")

    for field, val in req.model_dump(exclude_none=True).items():
        setattr(hotel, field, val)

    if req.city or req.address:
        city = req.city or hotel.city or ''
        addr = req.address or hotel.address or ''
        hotel.location = f"{city} - {addr}".strip(" -")

    db.commit()
    db.refresh(hotel)
    return hotel


@router.delete("/{hotel_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_hotel(
    hotel_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """حذف فندق — صلاحية الإدارة العامة فقط"""
    hotel = db.query(Hotel).filter(Hotel.id == hotel_id).first()
    if not hotel:
        raise HTTPException(status_code=404, detail="الفندق غير موجود")
    db.delete(hotel)
    db.commit()
    return None

