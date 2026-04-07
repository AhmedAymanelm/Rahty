from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from database import get_db
from services.auth_service import decode_token, get_user_by_id
from models.user import User

security = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    """Extract and validate the current user from JWT token."""
    token = credentials.credentials
    try:
        payload = decode_token(token)
        user_id = int(payload["sub"])
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="توكن غير صالح",
        )

    user = get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="المستخدم غير موجود",
        )
    return user


def require_role(*roles: str):
    """Dependency factory: require user to have one of the given roles."""
    def checker(user: User = Depends(get_current_user)):
        user_role = user.role.value if hasattr(user.role, 'value') else user.role
        if user_role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="ليس لديك صلاحية الوصول",
            )
        return user
    return checker


def check_hotel_access(user: User, target_hotel_id: int):
    """
    Helper to enforce data separation.
    Allows Admins to access anything.
    Forces others to only access their assigned hotel_id.
    """
    user_role = user.role.value if hasattr(user.role, 'value') else user.role
    if user_role == "admin":
        return True
    
    if user.hotel_id != target_hotel_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="لا تملك صلاحية الوصول لبيانات هذا الفندق",
        )
    return True
