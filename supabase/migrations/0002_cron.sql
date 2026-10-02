-- Background jobs. In Supabase: Database → Extensions → enable pg_cron, then run this.

create extension if not exists pg_cron;

-- Every 5 minutes: lock classes that are 12 hours away and use visits.
select cron.schedule('lock-due-sessions', '*/5 * * * *', 'select public.lock_due_sessions()');

-- Every night: create classes 8 weeks ahead and sign people up from their schedule.
select cron.schedule('generate-sessions', '15 3 * * *', 'select public.generate_sessions()');
