SELECT
  pc.campaign_id,
  pc.po_numbers,
  wr.room_code,
  wr.active_po,
  wt.po_number,
  wt.ticket_number,
  wt.status
FROM public.production_campaigns pc
LEFT JOIN public.weigh_rooms wr ON wr.status='In Use'
LEFT JOIN public.weigh_tickets wt
  ON wt.po_number = ANY(string_to_array(pc.po_numbers, ','))
WHERE pc.status='In Weighing'
ORDER BY pc.id DESC, wt.id;
