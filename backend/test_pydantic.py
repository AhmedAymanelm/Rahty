from database import SessionLocal
from models.user import User
from schemas.auth import UserOut
db = SessionLocal()
u = db.query(User).first()
if u:
    print(UserOut.model_validate(u))
else:
    print("No user")
