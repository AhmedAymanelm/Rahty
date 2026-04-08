import sqlite3

def add_columns():
    conn = sqlite3.connect("hokama.db")
    cursor = conn.cursor()
    columns_to_add = [
        "national_id VARCHAR(50)",
        "phone_number VARCHAR(50)",
        "email VARCHAR(150)",
        "hiring_date DATE",
        "contract_type VARCHAR(50)",
        "basic_salary NUMERIC"
    ]
    
    for col in columns_to_add:
        try:
            cursor.execute(f"ALTER TABLE users ADD COLUMN {col}")
            print(f"Added {col}")
        except sqlite3.OperationalError as e:
            print(f"Skipped {col} - {e}")
            
    conn.commit()
    conn.close()

add_columns()
