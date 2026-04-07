from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from middleware.auth import get_current_user, require_role, check_hotel_access
from models.broadcast import Broadcast, BroadcastRead, BroadcastTargetRole
from models.hotel import Hotel
from models.user import User
from schemas.broadcast import BroadcastCreate, BroadcastInboxOut, BroadcastListOut, BroadcastOut

router = APIRouter(prefix="/api/broadcasts", tags=["Broadcasts"])


def _target_recipients_query(db: Session, broadcast: Broadcast):
    q = db.query(User).filter(User.is_active == True)

    if broadcast.hotel_id:
        q = q.filter(User.hotel_id == broadcast.hotel_id)

    if broadcast.target_role != BroadcastTargetRole.all:
        q = q.filter(User.role == broadcast.target_role)

    q = q.filter(User.id != broadcast.creator_id)
    return q


@router.post("", response_model=BroadcastOut)
def create_broadcast(
    req: BroadcastCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "supervisor", "superfv")),
):
    role = current_user.role.value if hasattr(current_user.role, "value") else current_user.role

    try:
        target_role = BroadcastTargetRole(req.target_role)
    except ValueError:
        raise HTTPException(status_code=400, detail="الدور المستهدف غير صحيح")

    hotel_id = req.hotel_id
    if role in ["supervisor", "superfv"]:
        hotel_id = current_user.hotel_id
    elif hotel_id is not None and role == "admin":
        # Admin can target specific hotel or all hotels (None).
        pass

    broadcast = Broadcast(
        title=req.title,
        message=req.message,
        target_role=target_role,
        hotel_id=hotel_id,
        creator_id=current_user.id,
    )
    db.add(broadcast)
    db.commit()
    db.refresh(broadcast)
    return BroadcastOut(
        id=broadcast.id,
        title=broadcast.title,
        message=broadcast.message,
        target_role=broadcast.target_role.value,
        hotel_id=broadcast.hotel_id,
        hotel_name=broadcast.hotel.name if broadcast.hotel else None,
        creator_id=broadcast.creator_id,
        created_at=broadcast.created_at,
    )


@router.get("", response_model=List[BroadcastListOut])
def list_broadcasts(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "supervisor", "superfv")),
):
    role = current_user.role.value if hasattr(current_user.role, "value") else current_user.role
    q = db.query(Broadcast)

    if role in ["supervisor", "superfv"]:
        q = q.filter(Broadcast.hotel_id == current_user.hotel_id)

    rows = q.order_by(Broadcast.created_at.desc()).all()

    hotel_map = {h.id: h.name for h in db.query(Hotel).all()}

    results = []
    for row in rows:
        recipients_count = _target_recipients_query(db, row).count()
        read_count = (
            db.query(func.count(BroadcastRead.id))
            .filter(BroadcastRead.broadcast_id == row.id)
            .scalar()
        ) or 0
        results.append(
            BroadcastListOut(
                id=row.id,
                title=row.title,
                message=row.message,
                target_role=row.target_role.value,
                hotel_id=row.hotel_id,
                hotel_name=hotel_map.get(row.hotel_id) if row.hotel_id else None,
                creator_id=row.creator_id,
                created_at=row.created_at,
                read_count=read_count,
                recipients_count=recipients_count,
            )
        )

    return results


@router.get("/inbox", response_model=List[BroadcastInboxOut])
def get_inbox(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role = current_user.role.value if hasattr(current_user.role, "value") else current_user.role

    q = db.query(Broadcast)

    # Admin inbox: see all broadcasts regardless of target role/hotel.
    if role != "admin":
        q = q.filter((Broadcast.hotel_id.is_(None)) | (Broadcast.hotel_id == current_user.hotel_id))
        try:
            role_enum = BroadcastTargetRole(role)
            q = q.filter((Broadcast.target_role == BroadcastTargetRole.all) | (Broadcast.target_role == role_enum))
        except ValueError:
            q = q.filter(Broadcast.target_role == BroadcastTargetRole.all)

    rows = q.order_by(Broadcast.created_at.desc()).limit(20).all()

    hotel_map = {h.id: h.name for h in db.query(Hotel).all()}

    read_ids = {
        r.broadcast_id
        for r in db.query(BroadcastRead).filter(BroadcastRead.user_id == current_user.id).all()
    }

    result = []
    for row in rows:
        result.append(
            BroadcastInboxOut(
                id=row.id,
                title=row.title,
                message=row.message,
                target_role=row.target_role.value,
                hotel_id=row.hotel_id,
                hotel_name=hotel_map.get(row.hotel_id) if row.hotel_id else None,
                creator_id=row.creator_id,
                created_at=row.created_at,
                is_read=row.id in read_ids,
            )
        )
    return result


@router.post("/{broadcast_id}/read")
def mark_as_read(
    broadcast_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = db.query(Broadcast).filter(Broadcast.id == broadcast_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="التعميم غير موجود")

    role = current_user.role.value if hasattr(current_user.role, "value") else current_user.role

    if row.hotel_id is not None and role != "admin":
        check_hotel_access(current_user, row.hotel_id)

    if role != "admin" and row.target_role != BroadcastTargetRole.all and row.target_role.value != role:
        raise HTTPException(status_code=403, detail="ليس لديك صلاحية على هذا التعميم")

    existing = (
        db.query(BroadcastRead)
        .filter(BroadcastRead.broadcast_id == broadcast_id, BroadcastRead.user_id == current_user.id)
        .first()
    )
    if not existing:
        existing = BroadcastRead(broadcast_id=broadcast_id, user_id=current_user.id)
        db.add(existing)
        db.commit()

    return {"detail": "تم تعليم التعميم كمقروء"}
