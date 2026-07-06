
# Railway AMC Complaint Management System

## Project Overview

Railway AMC Complaint Management System is a web-based application developed to manage and track maintenance complaints efficiently. The system allows users to register complaints, administrators to assign technicians, and technicians to resolve issues within the specified time frame.

The project is designed to automate the complaint handling process, improve response time, and provide transparency in complaint tracking.

---

## Objectives

* Digitalize complaint registration and management.
* Reduce manual paperwork.
* Track complaint status in real time.
* Assign complaints to technicians efficiently.
* Monitor complaint resolution and closure process.
* Maintain complaint history in a centralized database.

---

## Technologies Used

### Frontend

* HTML5
* CSS3
* JavaScript

### Backend

* Node.js
* Express.js

### Database

* PostgreSQL

### Version Control

* Git
* GitHub

---

## User Roles

### 1. Admin

Admin is responsible for managing all complaints and technicians.

#### Features

* View dashboard statistics.
* Receive complaints.
* Assign technicians.
* View all complaints.
* Filter complaints by asset type.
* Verify technician resolutions.
* Close complaints.
* Monitor complaint status.

### 2. Technician

Technician is responsible for resolving assigned complaints.

#### Features

* View assigned complaints.
* Accept complaints.
* Resolve complaints.
* Update complaint status.
* Send resolution details to admin.
* Track pending and resolved complaints.

### 3. User

User can register complaints and track complaint status.

#### Features

* Register complaints.
* Generate complaint ticket.
* Track complaint progress.
* View complaint history.

---

## Complaint Workflow

1. User registers a complaint.
2. Complaint is stored in PostgreSQL database.
3. Admin receives the complaint.
4. Admin assigns a technician.
5. Technician accepts the complaint.
6. Technician resolves the issue.
7. Resolution is sent to Admin.
8. Admin verifies the resolution.
9. Complaint is closed.

---

## Database Structure

### Technicians Table

| Column   |
| -------- |
| id       |
| name     |
| email    |
| password |

### Complaints Table

| Column          |
| --------------- |
| id              |
| ticket_number   |
| user_id         |
| phone           |
| product         |
| department      |
| subject         |
| description     |
| status          |
| technician_id   |
| assigned_at     |
| accepted_at     |
| resolved_at     |
| resolution_note |
| created_at      |

---

## Complaint Status Flow

Pending → Assigned → Accepted → Resolved → Closed

---

## Dashboard Features

### Admin Dashboard

Cards:

* Total Complaints
* Pending Complaints
* Resolved Complaints

Functions:

* Assign Technician
* Close Complaint
* View Complaint Details
* Filter Complaints

### Technician Dashboard

Cards:

* Total Assigned
* Pending Complaints
* Resolved Complaints
* Closed Complaints

Functions:

* Accept Complaint
* Resolve Complaint
* View Assigned Complaints

---

## Installation

### Clone Repository

```bash
git clone https://github.com/your-username/AMC-main.git
```

### Install Dependencies

```bash
npm install
```

### Configure PostgreSQL Database

Create database and update database credentials in:

```text
config/db.js
```

### Start Server

```bash
node server.js
```

Server runs on:

```text
http://localhost:5000
```

---

## Future Enhancements

* Email Notifications
* SMS Alerts
* File Upload Support
* Complaint Priority Levels
* Report Generation
* Analytics Dashboard
* JWT Authentication

---

## Project Author

Vaibhav Gautam
Tarun Saxena 


Railway AMC Complaint Management System

Developed using Node.js, Express.js, PostgreSQL, HTML, CSS, and JavaScript.

# NCR-Agra-AMC-Management-System
