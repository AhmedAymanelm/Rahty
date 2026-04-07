import requests

BASE = "http://localhost:8000/api"

# 1. Login as Admin
res = requests.post(f"{BASE}/auth/login", json={"username": "admin", "password": "admin123"})
admin_token = res.json()["access_token"]
headers = {"Authorization": f"Bearer {admin_token}"}

# 2. Get Users to find a cleaner in hotel 1
users = requests.get(f"{BASE}/auth/users", headers=headers).json()
cleaner_id = next(u["id"] for u in users if u["role"] == "cleaner" and u["hotel_id"] == 1)

# 3. Create Task
task_data = {
    "title": "Clean room 101",
    "description": "Guest checked out",
    "priority": "urgent",
    "hotel_id": 1,
    "assigned_to_id": cleaner_id
}
task_res = requests.post(f"{BASE}/tasks", json=task_data, headers=headers)
print("Create Task:", task_res.status_code, task_res.json().get("title"))

# 4. Login as cleaner
res_c = requests.post(f"{BASE}/auth/login", json={"username": "cleaner1", "password": "123456"})
cleaner_token = res_c.json()["access_token"]
cleaner_headers = {"Authorization": f"Bearer {cleaner_token}"}

# 5. List tasks for cleaner
tasks = requests.get(f"{BASE}/tasks", headers=cleaner_headers).json()
print("Cleaner Tasks:", len(tasks), tasks[0]["title"])
task_id = tasks[0]["id"]

# 6. Complete task as cleaner
res_patch = requests.patch(f"{BASE}/tasks/{task_id}/status", json={"status": "completed"}, headers=cleaner_headers)
print("Cleaner Update:", res_patch.status_code, res_patch.json().get("status"))

