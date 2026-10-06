-- Preserve the official sample flags created during the initial live test.
update public.creative_flags set user_id = 6
where client_id = 2 and user_id = 4 and metric = 'ctr'
  and ad_id in ('SAMPLE-01', 'SAMPLE-04', 'SAMPLE-05', 'SAMPLE-08')
  and current_window_start = '2026-09-22' and current_window_end = '2026-09-28';

-- A foreign key blocks removal if any unrelated historical rows need review.
delete from public.client_users where client_id = 2 and user_id in (4, 5);
