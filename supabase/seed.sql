-- Numbered demo identities, not Supabase Auth accounts. No login is invented.
insert into public.clients (client_id, client_name) values
  (1, 'Client 1'), (2, 'Client 2') on conflict (client_id) do nothing;

insert into public.app_users (user_id, display_name) values
  (1, 'User 1'), (2, 'User 2'), (3, 'User 3'),
  (4, 'User 4'), (5, 'User 5'), (6, 'User 6')
  on conflict (user_id) do nothing;

insert into public.client_users (client_id, user_id) values
  (1, 1), (1, 2), (1, 3), (1, 4), (1, 5),
  (2, 4), (2, 5), (2, 6)
  on conflict (client_id, user_id) do nothing;
