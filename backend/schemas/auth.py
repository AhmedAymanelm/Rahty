from pydantic import BaseModel
from typing import Optional


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"


class HotelOut(BaseModel):
    id: int
    name: str

    class Config:
        from_attributes = True

class UserOut(BaseModel):
    id: int
    username: str
    full_name: str
    role: str
    hotel_id: Optional[int] = None
    is_active: Optional[bool] = True
    hotel: Optional[HotelOut] = None

    class Config:
        from_attributes = True


class UserCreate(BaseModel):
    username: str
    password: str
    full_name: str
    role: str
    hotel_id: Optional[int] = None


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = None
    hotel_id: Optional[int] = None
    is_active: Optional[bool] = None


class UserSelfUpdate(BaseModel):
    full_name: Optional[str] = None
    username: Optional[str] = None
    current_password: Optional[str] = None
    new_password: Optional[str] = None


# Rebuild to resolve forward ref
LoginResponse.model_rebuild()
