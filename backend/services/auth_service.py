import jwt
import bcrypt
from sqlalchemy.orm import Session
from models.user import User
from config import SECRET_KEY, ALGORITHM


def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Verify a plain password against a bcrypt hash."""
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_token(user: User) -> str:
    """Create a JWT token with NO expiration (lifetime token)."""
    payload = {
        "sub": str(user.id),
        "username": user.username,
        "role": user.role.value if hasattr(user.role, 'value') else user.role,
        "hotel_id": user.hotel_id,
        # No "exp" field = token never expires
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    """Decode and validate a JWT token."""
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])


def authenticate_user(db: Session, username: str, password: str) -> User | None:
    """Authenticate user by username and password."""
    user = db.query(User).filter(User.username == username, User.is_active == True).first()
    if not user:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user


def get_user_by_id(db: Session, user_id: int) -> User | None:
    """Get user by ID."""
    return db.query(User).filter(User.id == user_id, User.is_active == True).first()
