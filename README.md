# EES Pharma Process Twin

![Version](https://img.shields.io/badge/version-v2.0.2-00c8ff)

![Status](https://img.shields.io/badge/status-active-38e58c)

![Platform](https://img.shields.io/badge/platform-EES%20Universe-7c5cff)

![Backend](https://img.shields.io/badge/backend-FastAPI-009688)

![Database](https://img.shields.io/badge/database-PostgreSQL-336791)

![Frontend](https://img.shields.io/badge/frontend-React%20%2B%20Vite-646cff)

## Enterprise Pharmaceutical Manufacturing Digital Twin

\*\*\*\*EES Pharma Process Twin v2.0.2\*\*\*\* is an interactive
pharmaceutical manufacturing digital twin built as part of the
\*\*\*\*Enterprise Execution Suite (EES) Universe\*\*\*\*.

The project models the digital thread of a pharmaceutical production
order as it moves through plant operations---from office release and
warehouse material handling through weighing, bulk processing, mixing,
hold, packaging, quality, finished-goods reconciliation, shipping, and
supporting enterprise systems.

Version 2.0.2 expands the connected manufacturing environment with
production variations, material selection, equipment state, PLC/HMI
interaction, finished-goods reconciliation, and enterprise-level
operational visibility. This release also completes the expanded Pharma
Parking Access integration, including a 70-space secured lot, 30-space
overflow lot, 100-space combined capacity, contractor and visitor
visibility, shift-based accelerated Auto Run status, overflow parking
assignments, and Security Command Center / 3D facility monitoring.

------------------------------------------------------------------------

# v2.0.2 Highlights

## Connected Manufacturing Workflow

The production order maintains a common digital thread across the
simulated plant:

\*\*\*\*Office → Warehouse → Weighing → Bulk → Mixing → Hold → Packaging
→ Quality → Finished Goods → Shipping\*\*\*\*

Production information remains associated with the active order as it
progresses between departments.

Typical production context includes:

-   Production Order

-   Batch Number

-   Product

-   Flavor

-   Dye configuration

-   Bulk excipient

-   Planned quantity

-   Material requirements

-   Equipment assignment

-   Process status

-   Packaging results

-   Quality disposition

-   Finished-goods quantity

-   Shipping status

------------------------------------------------------------------------

# Product & Batch Variation

Version 2.0.2 introduces configurable batch variations so production is
no longer limited to a single fixed formulation demonstration.

Operators can configure supported production characteristics such as:

-   Product flavor

-   Dye / no-dye configuration

-   Bulk excipient selection

Supported bulk excipient selections include:

-   Glycerin

-   Propylene Glycol

-   Sorbitol Solution

Water remains a required common bulk component of the simulated
formulation.

The variation system allows different production runs to follow the same
digital manufacturing workflow while using different formulation
configurations.

------------------------------------------------------------------------

# Office / Production Release

The Office workflow acts as the starting point for production execution.

Production orders define the manufacturing requirements that downstream
departments use throughout the batch.

The release process establishes the digital thread used by:

-   Warehouse

-   Weighing

-   Bulk

-   Mixing

-   Hold

-   Packaging

-   Quality

-   Finished Goods

-   Shipping

Material availability and production requirements remain tied to the
active order.

------------------------------------------------------------------------

# Warehouse Operations

Warehouse operations simulate material staging and picking for released
production orders.

The workflow includes:

-   Material requirements

-   Picking progress

-   Material availability

-   Production-order association

-   Warehouse handoff

-   Exception handling

Production cannot proceed normally when required materials are
unavailable.

------------------------------------------------------------------------

# Controlled Weighing

The weighing workflow represents controlled pharmaceutical material
dispensing.

Features include:

-   Production-order context

-   Material selection

-   Weight progression

-   Scale tare controls

-   Material verification

-   Weigh-room assignment

-   Batch traceability

The tare interlock prevents operators from beginning a different
material weighing operation without properly resetting the scale.

------------------------------------------------------------------------

# Bulk Processing

The Bulk workflow supports formulation-dependent material preparation.

Version 2.0.2 introduces selectable bulk excipients:

-   Glycerin

-   Propylene Glycol

-   Sorbitol Solution

Water remains consistent across supported batch configurations.

Bulk processing remains connected to the production order so downstream
Mixing receives the correct formulation context.

------------------------------------------------------------------------

# Mixing & Hold

The Mixing workflow models the transfer and processing of weighed and
bulk materials.

The digital twin tracks:

-   Active production order

-   Assigned mixing equipment

-   Mixing state

-   Batch progression

-   Equipment conditions

-   Transfer readiness

-   Hold-tank availability

Available hold tanks can be selected for transfer.

Unavailable, dirty, or otherwise unsuitable equipment prevents normal
selection and generates the appropriate operational state.

------------------------------------------------------------------------

# PLC / HMI Integration

The project includes simulated industrial control interaction for
production equipment.

The interface provides:

-   Equipment state

-   HMI controls

-   PLC status

-   Interlocks

-   Alarm state

-   Operating mode

-   Primary output state

-   Process signals

-   PLC logic access

Fault conditions can redirect operators toward the PLC/HMI interface for
troubleshooting.

This provides a portfolio demonstration of the relationship between:

\*\*\*\*Enterprise Software → Manufacturing Execution → HMI → PLC →
Equipment\*\*\*\*

------------------------------------------------------------------------

# Packaging Operations

Packaging converts approved bulk product into finished packaged units.

The simulation includes:

-   Packaging progression

-   Production-order context

-   Line operation

-   Good-unit counts

-   Reject counts

-   Packaging faults

-   Final bottle reconciliation

Packaging timing is optimized for demonstration use so an end-to-end
production run can be completed without excessive simulation time.

------------------------------------------------------------------------

# Finished-Goods Reconciliation

Version 2.0.2 adds finished-goods reconciliation to prevent unrealistic
replenishment requests.

The system compares:

\*\*\*\*Planned Quantity - Accepted Finished Units = Remaining Quantity
Required\*\*\*\*

This allows operations to request only the actual shortage required to
satisfy the production order.

For example:

``` text

Planned quantity:       4,200 bottles

Accepted finished:      4,183 bottles

Rejected:                  17 bottles

Remaining requirement:     17 bottles
```

The replenishment request should therefore be based on the
\*\*\*\*17-bottle shortage\*\*\*\*, rather than allowing an arbitrary
replacement quantity.

This creates a more realistic connection between Packaging, Quality,
Finished Goods, and Office planning.

------------------------------------------------------------------------

# Quality Operations

Quality remains part of the production digital thread.

The workflow provides production and batch context for quality
disposition and downstream release decisions.

Quality status contributes to determining whether product can continue
toward finished-goods handling and shipment.

------------------------------------------------------------------------

# Shipping

Released finished goods can progress to the Shipping workflow.

Shipping maintains production-order context and provides shipment
completion information back to the Enterprise Command Center.

The digital thread therefore extends from the initial production request
through final shipment.

------------------------------------------------------------------------

# Enterprise Command Center

The Enterprise Command Center provides a high-level operational view
across the Pharma Process Twin.

It acts as the central supervisory layer for:

-   Production status

-   Active orders

-   Department state

-   Operational alerts

-   Equipment state

-   Digital-thread information

-   Security operations

-   3D plant navigation

The Command Center is designed to demonstrate how operational
information from multiple plant systems can be consolidated into a
single enterprise interface.

------------------------------------------------------------------------

# Security Command Center

Version 2.0.2 introduces a dedicated \*\*\*\*Security Command
Center\*\*\*\* within the Enterprise Command Center.

Security operations are separated from normal manufacturing execution
while remaining part of the larger facility digital twin.

The Security Command Center connects the manufacturing environment with
the separate:

\*\*\*\*EES Pharma Parking Access Digital Twin\*\*\*\*

This demonstrates how plant security and access-control systems can
participate in the wider enterprise architecture without becoming part
of the manufacturing control loop.

Version 2.0.2 expands Security Command Center parking visibility with:

-   Secured lot occupancy (`0/70` through `70/70`)
-   Overflow lot occupancy (`0/30` through `30/30`)
-   Combined parking occupancy (`0/100` through `100/100`)
-   Employees on site
-   Contractors on site
-   Visitors on site
-   Pending Security reviews
-   Secured-lot parking assignments
-   Overflow-lot parking assignments
-   Parking Auto Run state
-   Auto Run phase
-   Simulated day and clock
-   Current and next parking events
-   Overflow-related access events

The Parking view maintains separate live rosters for the secured and
overflow lots so Security can distinguish the vehicle's parking
destination without changing its employee, contractor, or visitor
identity.

------------------------------------------------------------------------

# Parking Access Integration

The Pharma Process Twin now includes campus-level integration with the
EES Pharma Parking Access Digital Twin.

The parking system can represent:

-   Employee access

-   Visitor access

-   Suspended employees

-   Employees on leave

-   Security review

-   Security override

-   Access approval

-   Access denial

-   Parking occupancy

-   Employees currently in the lot

-   Visitors currently in the lot

Security can authorize exceptional employee access when legitimate plant
access is required, such as:

-   Equipment return

-   Medical appointments

-   Meetings

-   Conferences

-   Administrative requirements

The parking system remains operationally independent from production
execution.

A parking-system outage therefore does \*\*\*\*not\*\*\*\* stop
pharmaceutical manufacturing.

------------------------------------------------------------------------

# Immersive 3D Plant Navigation

The application includes an interactive isometric plant navigation
environment.

Operational zones represented in the digital facility include:

-   Office

-   Warehouse

-   Weigh Rooms

-   Bulk Tank Farm

-   Mix & Hold

-   Packaging

-   QA / QC

-   R&D Lab

-   Compliance

-   Reliability

-   Shipping

-   Automation

-   Employee Parking (70-space secured lot + 30-space overflow lot)

The 3D environment provides:

-   Department navigation

-   Equipment state

-   Asset counts

-   Operational status

-   Camera presets

-   HMI access

-   PLC access

-   Parking Digital Twin access

Version 2.0.2 expands the exterior facility visualization to represent
both operational parking resources:

-   70-space secured main parking grid
-   30-space secured overflow parking grid
-   Independent secured and overflow occupancy
-   100-space combined capacity
-   Employee, contractor, and visitor parking counts
-   Direct Parking Access Digital Twin navigation

The 3D environment is a supervisory visualization layer and does not
replace the underlying production workflow.

\> \*\*\*\*v2.0.2 note:\*\*\*\* Additional visual alignment and
responsive-layout refinement of the exterior parking visualization is
planned for a future UI maintenance release. This does not affect
process execution or parking-system integration.

------------------------------------------------------------------------

# Demo Reset

The application provides a Demo Reset capability for repeated portfolio
demonstrations.

Resetting the environment restores the simulation to a known starting
state so another end-to-end production scenario can be executed.

------------------------------------------------------------------------

# System Architecture

``` text

                    EES ENTERPRISE EXECUTION SUITE

                               │

                  ┌────────────┴────────────┐

                  │                         │

        Enterprise Command Center    Security Command Center

                  │                         │

                  │                         └──────────────┐

                  │                                        │

          Pharma Process Twin                    Parking Access Twin (70 + 30)

                  │                                        │

    ┌─────────────┼──────────────┐                         │

    │             │              │                         │

 Production    Equipment      Quality                  Security

 Workflow      PLC / HMI      Systems                  Access

    │             │              │                         │

    └─────────────┴──────────────┴──────────┬──────────────┘

                                            │

                                   EES Data Platform

                                            │

                                        PostgreSQL
```

------------------------------------------------------------------------

# Technology Stack

## Frontend

-   React

-   TypeScript

-   Vite

-   CSS

-   Interactive digital-twin UI

## Backend

-   Python

-   FastAPI

-   Uvicorn

-   REST API

## Data Layer

-   PostgreSQL

-   EES shared data architecture

## Industrial Simulation

-   PLC state simulation

-   HMI interaction

-   Equipment interlocks

-   Alarm simulation

-   Process-state modeling

## Deployment Architecture

The project is designed for:

-   Local development

-   GitHub source control

-   GitHub Pages portfolio presentation

-   Cloud frontend deployment

-   Railway-compatible backend/database deployment

------------------------------------------------------------------------

# Local Development

## Backend

From the backend directory:

``` bash

cd backend
```

Activate the project virtual environment as appropriate for your local
installation.

Then start FastAPI:

``` bash

python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

The local API should be available at:

``` text

http://127.0.0.1:8000
```

------------------------------------------------------------------------

## Frontend

Open another terminal:

``` bash

cd frontend

npm install

npm run dev
```

Vite will display the local development address.

Typical development URLs include:

``` text

http://localhost:5173
```

or:

``` text

http://127.0.0.1:5173
```

------------------------------------------------------------------------

# Environment Configuration

Frontend API configuration is managed through environment variables.

Example:

``` env

VITE_API_BASE_URL=http://127.0.0.1:8000
```

Production secrets and environment-specific credentials should never be
committed to Git.

Use `.env.example` files to document required configuration.

------------------------------------------------------------------------

# Repository Security

Do not commit:

``` text

.env

.venv/

venv/

node_modules/

__pycache__/

*.pyc

.DS_Store
```

Database credentials, API keys, deployment secrets, and other sensitive
values should be managed through local or cloud environment variables.

------------------------------------------------------------------------

# Suggested Demo Flow

A complete portfolio demonstration can follow:

``` text

1. Reset Demo

       ↓

2. Create / Release Production Order

       ↓

3. Select Product Variation

       ↓

4. Warehouse Picking

       ↓

5. Controlled Weighing

       ↓

6. Bulk Excipient Processing

       ↓

7. Mixing

       ↓

8. Hold Tank Transfer

       ↓

9. Packaging

       ↓

10. Quality Disposition

       ↓

11. Finished-Goods Reconciliation

       ↓

12. Request Exact Shortage if Required

       ↓

13. Finished-Goods Pickup

       ↓

14. Shipping

       ↓

15. Enterprise Command Center Review

       ↓

16. Security Command Center Parking Review

       ↓

17. Start / Observe Parking Auto Run

       ↓

18. Verify Secured + Overflow Parking Status
```

The Security Command Center and Parking Access Digital Twin can be
demonstrated alongside this workflow to show the wider connected-plant
architecture.

------------------------------------------------------------------------

# EES Universe

EES Pharma Process Twin is one component of the broader \*\*\*\*EES
Universe\*\*\*\* portfolio architecture.

The EES portfolio explores interconnected systems across:

-   Pharmaceutical manufacturing

-   Supply-chain operations

-   Manufacturing intelligence

-   Asset health

-   Industrial automation

-   Energy infrastructure

-   Enterprise data engineering

-   Security and access control

-   Artificial intelligence

-   Digital twins

Rather than presenting each project only as an isolated application, EES
demonstrates how operational systems can exchange information through a
common enterprise architecture.

------------------------------------------------------------------------

# Version

\*\*\*\*Current Release: v2.0.2\*\*\*\*

### v2.0.2 --- Connected Manufacturing + Facility Access Integration

Major capabilities include:

-   End-to-end pharmaceutical production workflow

-   Product and flavor variations

-   Dye / no-dye production configuration

-   Selectable bulk excipients

-   Production-order digital thread

-   Warehouse material handling

-   Controlled weighing

-   Bulk processing

-   Mixing and hold operations

-   PLC/HMI interaction

-   Equipment state and interlocks

-   Packaging simulation

-   Finished-goods reconciliation

-   Exact shortage calculation

-   Quality workflow

-   Shipping integration

-   Enterprise Command Center

-   Security Command Center

-   Parking Access Digital Twin integration

-   Immersive 3D plant navigation

-   EES data-platform connectivity

-   PostgreSQL-backed enterprise architecture

------------------------------------------------------------------------

# v2.0.2 Parking Integration Update

This release completes the Pharma Process-side integration for the
expanded EES Pharma Parking Access Digital Twin v3.0.1.

The integration is designed so Parking Access remains an independently
deployable operational subsystem while Pharma Process consumes its
facility-level status.

Integrated parking information includes:

``` text
Secured Lot       70 spaces
Overflow Lot      30 spaces
Total Capacity   100 spaces
```

Pharma Process now presents this information in:

-   Process Overview
-   Security Command Center
-   Immersive 3D Digital Twin

Security can observe live secured and overflow assignments,
employee/contractor/visitor counts, pending reviews, and parking Auto
Run state. The 3D facility view visually separates the main and overflow
parking resources while maintaining direct navigation to the dedicated
Parking Access Digital Twin.

The accelerated parking simulation is shift-based and designed for rapid
portfolio demonstration. Its status can be monitored from Pharma Process
while the Parking Access service remains responsible for parking
execution and authoritative parking state.

------------------------------------------------------------------------

# Project Status

\*\*\*\*v2.0.2 --- Functional / Release Candidate\*\*\*\*

Core production execution, API connectivity, database connectivity,
enterprise command functions, Security Command Center integration, and
parking-system integration are operational. The v2.0.2 facility-access
integration consumes the expanded Parking Access v3.0.1 contract and
presents secured parking, overflow parking, combined capacity,
contractor/visitor status, and accelerated Auto Run state within Pharma
Process.

Future releases may expand:

\- Additional product/formulation variations

-   Advanced equipment fault scenarios

-   Historical batch analytics

-   Predictive maintenance

-   Manufacturing intelligence integration

-   Expanded EES cross-system event exchange

------------------------------------------------------------------------

## Author

\*\*\*\*Jeremiah Lupton\*\*\*\*

Enterprise Execution Suite / EES Universe

------------------------------------------------------------------------

## License

See the repository `LICENSE` file for licensing information.
