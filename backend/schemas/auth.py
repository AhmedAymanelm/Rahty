from pydantic import BaseModel
from typing import Optional


from datetime import date

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
    location: Optional[str] = None
    city: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    total_rooms: Optional[int] = 0
    total_floors: Optional[int] = 0
    stars: Optional[int] = 3
    description: Optional[str] = None
    manager_id: Optional[int] = None

    class Config:
        from_attributes = True


class HotelCreate(BaseModel):
    name: str
    city: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    total_rooms: Optional[int] = 0
    total_floors: Optional[int] = 0
    stars: Optional[int] = 3
    description: Optional[str] = None
    manager_id: Optional[int] = None


class HotelUpdate(BaseModel):
    name: Optional[str] = None
    city: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    total_rooms: Optional[int] = None
    total_floors: Optional[int] = None
    stars: Optional[int] = None
    description: Optional[str] = None
    manager_id: Optional[int] = None


class UserOut(BaseModel):
    id: int
    username: str
    full_name: str
    role: str
    hotel_id: Optional[int] = None
    is_active: Optional[bool] = True
    hotel: Optional[HotelOut] = None

    national_id: Optional[str] = None
    phone_number: Optional[str] = None
    email: Optional[str] = None
    hiring_date: Optional[date] = None
    contract_type: Optional[str] = None
    basic_salary: Optional[float] = None
    nationality: Optional[str] = None

    class Config:
        from_attributes = True


class UserCreate(BaseModel):
    username: str
    password: str
    full_name: str
    role: str
    hotel_id: Optional[int] = None

    national_id: Optional[str] = None
    phone_number: Optional[str] = None
    email: Optional[str] = None
    hiring_date: Optional[date] = None
    contract_type: Optional[str] = None
    basic_salary: Optional[float] = None
    nationality: Optional[str] = None


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = None
    hotel_id: Optional[int] = None
    is_active: Optional[bool] = None

    national_id: Optional[str] = None
    phone_number: Optional[str] = None
    email: Optional[str] = None
    hiring_date: Optional[date] = None
    contract_type: Optional[str] = None
    basic_salary: Optional[float] = None
    nationality: Optional[str] = None


class UserSelfUpdate(BaseModel):
    full_name: Optional[str] = None
    username: Optional[str] = None
    current_password: Optional[str] = None
    new_password: Optional[str] = None


# Rebuild to resolve forward ref
LoginResponse.model_rebuild()
