import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("Error: DATABASE_URL not found.")
    exit(1)

# Fix for sync driver if 'postgresql+asyncpg' or similar is used, though usually sqlalchemy uses psycopg2 for sync.
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

try:
    engine = create_engine(DATABASE_URL)
    with engine.connect() as conn:
        with conn.execution_options(isolation_level="AUTOCOMMIT"):
            try:
                conn.execute(text("ALTER TYPE warehouserequeststatus ADD VALUE 'supervisor_approved';"))
                print("Added 'supervisor_approved' to warehouserequeststatus enum.")
            except Exception as e:
                # Value might already exist, which is fine
                print("Note: Could not add enum. It might already exist.", str(e))
except Exception as e:
    print(f"Failed to migrate database: {e}")
