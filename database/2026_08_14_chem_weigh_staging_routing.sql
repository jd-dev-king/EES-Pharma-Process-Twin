-- Normalize the black-zone -> grey/white-zone handoff.
-- Warehouse delivers carts to a neutral Chem Weigh Staging boundary;
-- the approved PO weigh_room controls the subsequent bend-in.

BEGIN;

UPDATE warehouse_transfer_orders
SET destination = 'Chem Weigh Staging'
WHERE to_number NOT LIKE 'TO-FG-%'
  AND (destination = 'Weighing Staging' OR destination LIKE 'Weighing Staging %');

COMMIT;
