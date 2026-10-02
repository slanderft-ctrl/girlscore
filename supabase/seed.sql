-- Passes. Prices are in øre (1450 kr = 145000).
insert into public.pass_types (name, visits, valid_days, price_minor, sort_order) values
  ('Stretching i gruppe 8', 8, 30, 145000, 1),
  ('Stretching i gruppe 5', 5, 30, 110000, 2),
  ('Drop-in',               1, 30,  30000, 3);

-- Example group (edit or delete in the app under Групи).
with g as (
  insert into public.groups (name, capacity, location) values ('Gruppe 1', 10, null) returning id
)
insert into public.group_times (group_id, weekday, start_time, end_time)
select id, d, '18:00', '19:00' from g, (values (2), (4)) as v(d); -- Tuesday and Thursday

select public.generate_sessions();

-- After you have signed in once, make yourself the owner:
-- update public.profiles set is_admin = true where phone = '4791234567';
