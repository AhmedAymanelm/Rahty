from sqlalchemy import create_engine, text
from config import DATABASE_URL
import re

def migrate():
    db_url = DATABASE_URL or "sqlite:///./hokama.db"
    if db_url.startswith("postgresql://"):
        db_url = db_url.replace("postgresql://", "postgresql+psycopg://", 1)
        
    print(f"Connecting to: {db_url.split('@')[-1]}")
    engine = create_engine(db_url)
    
    with engine.begin() as conn:
        # Add column
        try:
            conn.execute(text("ALTER TABLE rooms ADD COLUMN floor INTEGER DEFAULT 1;"))
            print("Column 'floor' added successfully.")
        except Exception as e:
            if "duplicate column" in str(e).lower() or "already exists" in str(e).lower():
                print("Column 'floor' already exists.")
            else:
                print(f"Error adding column: {e}")
                
        # Fetch and update
        try:
            result = conn.execute(text("SELECT id, number FROM rooms;"))
            rooms = result.fetchall()
            
            updated_count = 0
            for r_id, number in rooms:
                num_str = str(number).strip()
                floor_val = 1
                
                # Simple heuristic: if number is like 105, 210, 1205 (first digits before last 2)
                match = re.match(r'^([A-Za-z- ]*)(\d+)\d{2}$', num_str)
                if match and match.group(2):
                    floor_val = int(match.group(2))
                elif num_str.isdigit() and int(num_str) < 100:
                    pass # keep as 1 or leave as is
                    
                conn.execute(text("UPDATE rooms SET floor = :floor WHERE id = :id"), {"floor": floor_val, "id": r_id})
                updated_count += 1
                
            print(f"Updated floor for {updated_count} rooms.")
        except Exception as e:
            print(f"Error updating rows: {e}")

if __name__ == "__main__":
    migrate()
