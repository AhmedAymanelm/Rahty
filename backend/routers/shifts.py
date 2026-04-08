from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from models.shift import Shift
from models.user import User
from schemas.shift import ShiftCreate, ShiftUpdate, ShiftOut
from middleware.auth import get_current_user

router = APIRouter(prefix="/api/shifts", tags=["Shifts"])

@router.get("", response_model=List[ShiftOut])
def list_shifts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get all shifts.
    """
    return db.query(Shift).filter(Shift.is_active == True).order_by(Shift.start_time).all()

@router.post("", response_model=ShiftOut)
def create_shift(
    payload: ShiftCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Create a new shift. (Admin only)
    """
    if current_user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Only admins can manage shifts")
    
    new_shift = Shift(**payload.dict())
    db.add(new_shift)
    db.commit()
    db.refresh(new_shift)
    return new_shift

@router.patch("/{shift_id}", response_model=ShiftOut)
def update_shift(
    shift_id: int,
    payload: ShiftUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Update an existing shift. (Admin only)
    """
    if current_user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Only admins can manage shifts")
    
    db_shift = db.query(Shift).filter(Shift.id == shift_id).first()
    if not db_shift:
        raise HTTPException(status_code=404, detail="Shift not found")
    
    update_data = payload.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_shift, key, value)
    
    db.commit()
    db.refresh(db_shift)
    return db_shift

@router.delete("/{shift_id}")
def delete_shift(
    shift_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Delete a shift (Soft delete). (Admin only)
    """
    if current_user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Only admins can manage shifts")
    
    db_shift = db.query(Shift).filter(Shift.id == shift_id).first()
    if not db_shift:
        raise HTTPException(status_code=404, detail="Shift not found")
    
    db_shift.is_active = False
    db.commit()
    return {"message": "Shift deleted successfully"}
