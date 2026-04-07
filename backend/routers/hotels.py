from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from models.hotel import Hotel
from schemas.auth import HotelOut
from middleware.auth import get_current_user
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
        hotels = db.query(Hotel).all()
    else:
        hotels = db.query(Hotel).filter(Hotel.id == current_user.hotel_id).all()
        
    return hotels
