# EES Pharma Process Twin — Parking Label Realignment Hotfix

This hotfix only realigns the readable parking status card.

## Change
- Moves the **PHARMA EMPLOYEE PARKING** card from the bottom of the 3D viewport.
- Places it directly beside the exterior parking lot in the open space to the lot's right.
- Keeps the card upright and readable at 100% browser zoom.
- Adds a short visual connector so the card is clearly associated with the parking lot.
- Keeps the card clickable to open the dedicated Parking Digital Twin.

## Not changed
- Parking lot position
- Plant / department positions
- FastAPI
- PostgreSQL
- Security Command Center
- CORS / API configuration
- PLC / SCADA
- Production logic

Only `frontend/src/styles.css` is replaced.
