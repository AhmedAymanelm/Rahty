from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from models.checklist import ChecklistItem
from models.user import User
from schemas.checklist import ChecklistItemCreate, ChecklistItemUpdate, ChecklistItemOut
from middleware.auth import get_current_user

router = APIRouter(prefix="/api/checklist", tags=["Checklist"])

@router.get("", response_model=List[ChecklistItemOut])
def list_checklist_items(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get all checklist items.
    """
    return db.query(ChecklistItem).filter(ChecklistItem.is_active == True).all()

@router.post("", response_model=ChecklistItemOut)
def create_checklist_item(
    payload: ChecklistItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Create a new checklist item. (Admin only)
    """
    if current_user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Only admins can manage the checklist")
    
    new_item = ChecklistItem(**payload.dict())
    db.add(new_item)
    db.commit()
    db.refresh(new_item)
    return new_item

@router.patch("/{item_id}", response_model=ChecklistItemOut)
def update_checklist_item(
    item_id: int,
    payload: ChecklistItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Update an existing checklist item. (Admin only)
    """
    if current_user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Only admins can manage the checklist")
    
    db_item = db.query(ChecklistItem).filter(ChecklistItem.id == item_id).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Checklist item not found")
    
    update_data = payload.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_item, key, value)
    
    db.commit()
    db.refresh(db_item)
    return db_item

@router.delete("/{item_id}")
def delete_checklist_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Delete a checklist item (Soft delete). (Admin only)
    """
    if current_user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Only admins can manage the checklist")
    
    db_item = db.query(ChecklistItem).filter(ChecklistItem.id == item_id).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Checklist item not found")
    
    db_item.is_active = False
    db.commit()
    return {"message": "Checklist item deleted successfully"}
