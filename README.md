# Rahty Hotel Governance System

Rahty is a comprehensive hotel management and governance system tailored for internal operations. It streamlines tasks across multiple hotel branches, offering role-based access for administrators, supervisors, accountants, receptionists, maintenance, and Housekeeping staff.

## Features

- **Role-Based Workflows**: Distinct interfaces and capabilities for Admins, Supervisors, Super-FVs, Accountants, Maintenance Technicians, Cleaners, and Receptionists.
- **Task Management**: Create, assign, and track hotel operation tasks.
- **Maintenance Ticketing**: Integrated issue reporting from room inspections directly converted into maintenance tickets.
- **Finance & Warehouse**: Financial shift reports, competitor pricing tracker, purchase orders, and central warehouse inventory management.
- **Real-Time Dashboards**: Overview of revenue, attendance, tasks completion, and maintenance KPIs.

## Technology Stack

- **Backend**: Python 3.11+, FastAPI, SQLAlchemy, Pydantic, Uvicorn.
- **Frontend**: Vanilla HTML5, CSS3, and JavaScript, ensuring a lightweight and exceedingly fast user experience.
- **Database**: SQLite (Development) / PostgreSQL (Production).

## Project Structure

- `/backend`: Contains the FastAPI application, divided into routers (tasks, finance, maintenance, rooms, auth), models, and schemas.
- `/frontend`: Contains the static files (HTML, CSS, JS) that make up the client interface. The backend is configured to mount this directory and serve it.
- `/scripts`: Utility scripts used for internal maintenance and end-to-end testing.

## Local Development

1. Create a virtual environment and install dependencies:
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt

2. Start the FastAPI development server:
   cd backend
   uvicorn main:app --reload --host 127.0.0.1 --port 8000

3. Access the application:
   The application will be available at http://127.0.0.1:8000.
   The default admin credentials are generated on startup (admin / admin123).

## Production Deployment (Railway)

The application is fully configured for deployment on Railway, utilizing Nixpacks.
A `railway.json` file is included in the root directory to automatically specify the start command.

1. Connect the repository to Railway.
2. Add a PostgreSQL database to the project via the Railway dashboard.
3. Configure the `DATABASE_URL` environment variable. The app automatically handles parsing PostgreSQL connections.
4. Deploy the service.

## API Documentation

FastAPI automatically generates interactive API documentation. When the server is running, navigate to:
- Swagger UI: `http://127.0.0.1:8000/docs`
- ReDoc: `http://127.0.0.1:8000/redoc`
