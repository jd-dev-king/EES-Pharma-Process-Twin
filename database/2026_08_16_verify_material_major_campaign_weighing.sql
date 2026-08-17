SELECT wt.po_number,wtl.material_code,wtl.material_name,wtl.lot_number,wtl.target_quantity,wtl.unit,wtl.status,wtl.scale_type
FROM public.weigh_tickets wt
JOIN public.weigh_ticket_lines wtl ON wtl.ticket_number=wt.ticket_number
ORDER BY wtl.material_code,wt.po_number,wtl.id;
