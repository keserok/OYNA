-- Realtime: vitrin ve tesis takvimi anlık güncellensin
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'pitch_bookings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pitch_bookings;
  END IF;
END $$;
