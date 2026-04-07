from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy import inspect
from database import engine, Base
from models.user import User, UserRole
from models.hotel import Hotel
from models.room import Room, RoomStatus
from models.task import Task
from models.task_message import TaskMessage
from models.maintenance import MaintenanceReport
from models.broadcast import Broadcast, BroadcastRead
from models.finance import ShiftReport, Expense, FinanceAuditLog, CompetitorPrice, OurPriceSetting, WarehouseItem
from models.attendance import AttendanceSession, AttendancePolicy
from services.auth_service import hash_password
from database import SessionLocal
from routers import auth as auth_router

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="راحتي — نظام حوكمة الفنادق",
    description="Backend API لنظام حوكمة مجموعة فنادق راحتي",
    version="1.0.0",
)

uploads_dir = Path(__file__).resolve().parent / "uploads"
uploads_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(uploads_dir)), name="uploads")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth_router.router)
from routers import hotels as hotels_router
app.include_router(hotels_router.router)
from routers import tasks as tasks_router
app.include_router(tasks_router.router)
from routers import rooms as rooms_router
app.include_router(rooms_router.router)
from routers import maintenance as maintenance_router
app.include_router(maintenance_router.router)
from routers import dashboard as dashboard_router
app.include_router(dashboard_router.router)
from routers import finance as finance_router
app.include_router(finance_router.router)
from routers import broadcasts as broadcasts_router
app.include_router(broadcasts_router.router)

# Serve frontend from the same host/port as the API.
frontend_dir = Path(__file__).resolve().parent.parent / "frontend"
if not frontend_dir.exists():
    raise RuntimeError(f"Frontend directory not found: {frontend_dir}")


@app.on_event("startup")
def seed_admin():
    """Seed the default admin user and initial hotels if not exists."""
    db = SessionLocal()
    try:
        # Backward-compatible lightweight migration for older DB files.
        inspector = inspect(engine)
        col_names = {c["name"] for c in inspector.get_columns("maintenance_reports")}
        if "verified_by_id" not in col_names:
            db.execute(text("ALTER TABLE maintenance_reports ADD COLUMN verified_by_id INTEGER"))
            db.commit()

        shift_col_names = {c["name"] for c in inspector.get_columns("shift_reports")}
        if "photo_url" not in shift_col_names:
            db.execute(text("ALTER TABLE shift_reports ADD COLUMN photo_url TEXT"))
            db.commit()

        # Seed Hotels First
        hotel_names = [
            "فندق راحتي ١ — الرياض",
            "فندق راحتي ٢ — جدة",
            "فندق راحتي ٣ — مكة",
            "فندق راحتي ٤ — المدينة",
            "فندق راحتي ٥ — الدمام",
            "فندق راحتي ٦ — أبها",
            "فندق راحتي ٧ — تبوك"
        ]
        
        for name in hotel_names:
            h = db.query(Hotel).filter(Hotel.name == name).first()
            if not h:
                h = Hotel(name=name)
                db.add(h)
                db.flush()
            
            # Seed 20 Rooms per Hotel if none exist
            if db.query(Room).filter(Room.hotel_id == h.id).count() == 0:
                for i in range(1, 21):
                    r_num = f"2{i:02d}" # Rooms 201 to 220
                    db.add(Room(number=r_num, hotel_id=h.id, status=RoomStatus.ready if i > 5 else RoomStatus.dirty))

        if db.query(WarehouseItem).count() == 0:
            defaults = [
                ("مناشف حمام", 3200, 1500, "قطعة"),
                ("صابون استحمام", 1800, 1500, "قطعة"),
                ("مصابيح LED", 300, 150, "قطعة"),
                ("مواد تنظيف", 400, 100, "لتر"),
            ]
            for name, qty, reorder, unit in defaults:
                db.add(WarehouseItem(item_name=name, quantity=qty, reorder_level=reorder, unit=unit))
        
        db.commit()

        # Seed Admin User
        admin = db.query(User).filter(User.username == "admin").first()
        if not admin:
            admin = User(
                username="admin",
                password_hash=hash_password("admin123"),
                full_name="عبدالرحمن المالكي",
                role=UserRole.admin,
                hotel_id=None,
            )
            db.add(admin)

            # Seed sample users for each role (linked to hotel ID 1)
            hotel_1 = db.query(Hotel).filter(Hotel.name == "فندق راحتي ١ — الرياض").first()
            hid = hotel_1.id if hotel_1 else 1

            sample_users = [
                ("supervisor1", "123456", "محمد السهلي", UserRole.supervisor, hid),
                ("superfv1", "123456", "خالد العمراني", UserRole.superfv, hid),
                ("cleaner1", "123456", "سعد الدوسري", UserRole.cleaner, hid),
                ("maintenance1", "123456", "عبدالله القحطاني", UserRole.maintenance, hid),
                ("reception1", "123456", "سلطان الغامدي", UserRole.reception, hid),
                ("accountant1", "123456", "ريم الحارثي", UserRole.accountant, hid),
            ]
            for uname, pwd, name, role, h_id in sample_users:
                u = User(
                    username=uname,
                    password_hash=hash_password(pwd),
                    full_name=name,
                    role=role,
                    hotel_id=h_id,
                )
                db.add(u)

            db.commit()
            print("✅ تم إنشاء الفنادق والمستخدمين الافتراضيين")
        else:
            print("ℹ️ الفنادق والمستخدمين موجودين في النظام مسبقاً")
    finally:
        db.close()


@app.get("/api/health")
def root():
    return {"message": "🏨 مرحباً بك في نظام حوكمة فنادق راحتي", "status": "running"}


@app.get("/", include_in_schema=False)
def root_page():
    return FileResponse(str(frontend_dir / "index.html"))


@app.get("/dashboard", include_in_schema=False)
def dashboard_page():
    return RedirectResponse(url="/", status_code=307)


# Mount frontend LAST so API routes (including /api/health) are matched first.
app.mount("/", StaticFiles(directory=str(frontend_dir), html=True), name="frontend")
