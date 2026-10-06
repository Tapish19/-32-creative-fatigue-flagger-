\set ON_ERROR_STOP on
begin;

create function pg_temp.assert_true(condition boolean, message text) returns void
language plpgsql as $$
begin
  if condition is distinct from true then raise exception 'Assertion failed: %', message; end if;
end;
$$;

-- Test-only principals; rolled back at the end.
insert into auth.users (id) values
  ('00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002');
update public.clients set auth_user_id = '00000000-0000-4000-8000-000000000001' where client_id = 1;
update public.clients set auth_user_id = '00000000-0000-4000-8000-000000000002' where client_id = 2;

insert into public.creative_flags
  (client_id, user_id, ad_id, creative_name, creative_filter, metric, drop_percent, dropped_on, current_window_start, current_window_end)
values
  (1, 4, 'client-1-ad', 'Client 1 creative', '{"drop_threshold":0.3}', 'ctr', 50.71, '2026-09-28', '2026-09-22', '2026-09-28'),
  (2, 6, 'client-2-ad', 'Client 2 creative', '{"cpc_increase_threshold":0.8}', 'cpc', -99.03, '2026-09-28', '2026-09-22', '2026-09-28');

select pg_temp.assert_true(not has_table_privilege('anon', 'public.app_users', 'select'), 'anonymous user access denied');
select pg_temp.assert_true(not has_table_privilege('anon', 'public.creative_flags', 'select'), 'anonymous flag access denied');

do $$
begin
  begin
    insert into public.creative_flags (client_id, user_id, ad_id, creative_name, creative_filter, metric, drop_percent, dropped_on, current_window_start, current_window_end)
    values (1, 6, 'forbidden', 'Wrong membership', '{}', 'ctr', 50, '2026-09-28', '2026-09-22', '2026-09-28');
    raise exception 'Wrong client/user membership accepted';
  exception when foreign_key_violation then null; end;
  begin
    insert into public.creative_flags (client_id, user_id, ad_id, creative_name, creative_filter, metric, drop_percent, dropped_on, current_window_start, current_window_end)
    values (2, 1, 'forbidden', 'Wrong membership', '{}', 'ctr', 50, '2026-09-28', '2026-09-22', '2026-09-28');
    raise exception 'Wrong client/user membership accepted';
  exception when foreign_key_violation then null; end;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
select pg_temp.assert_true((select array_agg(user_id order by user_id) = array[1,2,3,4,5]::bigint[] from public.app_users), 'client 1 sees users 1 through 5');
select pg_temp.assert_true((select count(*) = 1 and min(client_id) = 1 from public.clients), 'client 1 sees only its client');
select pg_temp.assert_true((select count(*) = 5 from public.client_users), 'client 1 sees only its five memberships');
select pg_temp.assert_true((select count(*) = 1 and min(ad_id) = 'client-1-ad' from public.creative_flags), 'client 1 sees only its flags');
select pg_temp.assert_true((select count(*) = 0 from public.creative_flags where client_id = 2), 'client 1 cannot request client 2 flags');
select pg_temp.assert_true((select count(*) = 0 from public.app_users where user_id = 6), 'client 1 cannot request user 6');

insert into public.creative_flags (client_id, user_id, ad_id, creative_name, creative_filter, metric, drop_percent, dropped_on, current_window_start, current_window_end)
values (1, 1, 'saved-by-client', 'Saved by client 1', '{}', 'ctr', 40, '2026-09-28', '2026-09-22', '2026-09-28');
select pg_temp.assert_true((select count(*) = 2 from public.creative_flags), 'client can append its own flags');

do $$
begin
  begin
    insert into public.creative_flags (client_id, user_id, ad_id, creative_name, creative_filter, metric, drop_percent, dropped_on, current_window_start, current_window_end)
    values (2, 6, 'forbidden-write', 'Other client', '{}', 'ctr', 40, '2026-09-28', '2026-09-22', '2026-09-28');
    raise exception 'Cross-client flag insert accepted';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.creative_flags (client_id, user_id, ad_id, creative_name, creative_filter, metric, drop_percent, dropped_on, current_window_start, current_window_end)
    values (1, 6, 'forbidden-user', 'Unassigned user', '{}', 'ctr', 40, '2026-09-28', '2026-09-22', '2026-09-28');
    raise exception 'Flag for unassigned user accepted';
  exception when foreign_key_violation then null; end;
  begin
    update public.clients set auth_user_id = auth.uid() where client_id = 2;
    raise exception 'Client ownership reassignment accepted';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.client_users values (1, 6);
    raise exception 'Client membership escalation accepted';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.creative_flags;
    raise exception 'Client flag deletion accepted';
  exception when insufficient_privilege then null; end;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
select pg_temp.assert_true((select array_agg(user_id order by user_id) = array[6,7,8,9,10]::bigint[] from public.app_users), 'client 2 sees users 6 through 10');
select pg_temp.assert_true((select count(*) = 1 and min(client_id) = 2 from public.clients), 'client 2 sees only its client');
select pg_temp.assert_true((select count(*) = 5 from public.client_users), 'client 2 sees only its five memberships');
select pg_temp.assert_true((select count(*) = 1 and min(ad_id) = 'client-2-ad' from public.creative_flags), 'client 2 sees only its flags for user 6');
select pg_temp.assert_true((select count(*) = 0 from public.creative_flags where client_id = 1), 'client 2 cannot request client 1 flags');

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', true);
select pg_temp.assert_true((select count(*) = 0 from public.clients), 'unassigned login sees no clients');
select pg_temp.assert_true((select count(*) = 0 from public.app_users), 'unassigned login sees no users');
select pg_temp.assert_true((select count(*) = 0 from public.creative_flags), 'unassigned login sees no flags');

select set_config('request.jwt.claim.sub', '', true);
select pg_temp.assert_true((select count(*) = 0 from public.app_users), 'missing identity sees no users');
reset role;
rollback;
\echo 'All client access and flag integrity checks passed.'
