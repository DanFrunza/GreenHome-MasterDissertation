# GreenHome – Master Dissertation Project

## Overview
GreenHome is an end-to-end smart home analytics platform built as my Master’s dissertation project in Software Engineering.
It connects local Home Assistant environments to a cloud backend for monitoring, remote control, anomaly detection, forecasting, and energy-focused insights.

## Problem and Goal
Home Assistant is strong for automation and local control, but limited for advanced long-term analytics and diagnostics.
This project extends Home Assistant with a cloud analytics layer that enables:
- historical analysis of sensor and device behavior,
- anomaly detection,
- prediction of future trends,
- practical decision support (diagnostics and ROI-oriented insights).

## Architecture
The platform is split into two layers.

### Local Layer
- Home Assistant instance
- Local MQTT broker (Mosquitto)
- MQTT bridge from local broker to cloud broker
- Local agent for Home Assistant discovery + command execution
- Simulated devices (CO2/ventilation, humidity/humidifier, PM2.5/purifier)

### Cloud Layer
- Cloud MQTT broker with authentication and ACL
- MQTT ingestion service
- REST API service
- PostgreSQL database
- Analytics service (aggregation, anomaly detection, prediction)
- Frontend dashboard

## End-to-End Data Flow
1. Devices/simulators publish telemetry to the local MQTT broker.
2. Home Assistant consumes telemetry and updates entity states.
3. Home Assistant publishes state updates to `home/ha/<entity_id>`.
4. Local MQTT bridge forwards these topics to the cloud broker using home-scoped prefixes.
5. Cloud ingestion service stores entities and measurements in PostgreSQL.
6. Analytics jobs compute aggregations, anomalies, and predictions.
7. Frontend consumes API endpoints for dashboards, diagnostics, and statistics.
8. User commands from frontend are sent back through cloud -> local -> Home Assistant, closing the control loop.

## Main Features
- Entity discovery from Home Assistant
- Automation discovery and synchronization
- Remote command execution for controllable entities
- Real-time and historical monitoring
- Statistical anomaly detection
- 30-day forecasting for selected metrics
- Diagnostics workflows and appliance-level insights
- Role-based multi-home access (owner/member model)

## Tech Stack
- Python
- Node.js + Express
- PostgreSQL
- MQTT (Mosquitto)
- Home Assistant
- React + Vite
- Docker / Docker Compose

## Repository Structure
- `local/` – Home Assistant setup, local broker, local agent, simulations
- `cloud/` – cloud broker, ingestion service, API, analytics service, frontend, database init

## Run the Project

### Prerequisites
- Docker
- Docker Compose

### 1) Start the cloud stack
```bash
cd cloud
docker compose up --build
```

### 2) Start the local stack
```bash
cd local
docker compose up --build
```

### Notes
- Configure environment variables for both stacks before first run.
- Cloud services expect database and MQTT credentials to be available through compose environment variables.
- Local MQTT bridge requires home credentials and cloud broker host/port.

## Dissertation Contribution
In this project I designed and implemented:
- the local-to-cloud architecture,
- the MQTT-based bidirectional data and command pipeline,
- backend ingestion and API services,
- analytics jobs for aggregation/anomaly/prediction,
- and the frontend user experience for monitoring and diagnostics.

## Author
Dan Frunza
