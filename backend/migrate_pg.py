from sqlalchemy import create_engine, text
from config import DATABASE_URL

db_url = DATABASE_URL
if db_url.startswith("postgresql://"):
    db_url = db_url.replace("postgresql://", "postgresql+psycopg://", 1)

engine = create_engine(db_url)

columns_sql = [
    "ALTER TABLE users ADD COLUMN national_id VARCHAR(50);",
    "ALTER TABLE users ADD COLUMN phone_number VARCHAR(50);",
    "ALTER TABLE users ADD COLUMN email VARCHAR(150);",
    "ALTER TABLE users ADD COLUMN hiring_date DATE;",
    "ALTER TABLE users ADD COLUMN contract_type VARCHAR(50);",
    "ALTER TABLE users ADD COLUMN basic_salary NUMERIC(10,2);"
]

with engine.begin() as conn:
    for sql in columns_sql:
        try:
            conn.execute(text(sql))
            print(f"Executed: {sql}")
        except Exception as e:
            print(f"Skipped {sql} - {e}")
            
print("Migration done.")
