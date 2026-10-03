INSERT INTO public.app_settings (key, numeric_value, description) VALUES
  ('live_train_enabled', 1, 'Live train journey screen on (1) / off (0)'),
  ('live_train_auto_refresh_enabled', 1, 'Auto refresh live train status (1/0)'),
  ('live_train_refresh_interval_seconds', 90, 'Seconds between automatic live status refreshes'),
  ('live_train_animation_enabled', 1, 'Animated railway scene (1/0)'),
  ('live_train_animation_quality', 2, 'Animation quality: 1 low, 2 medium, 3 high'),
  ('live_train_day_night_enabled', 1, 'Day/sunset/night scene (1/0)'),
  ('live_train_show_speed', 1, 'Show speed card (1/0)'),
  ('live_train_show_distance_travelled', 1, 'Show distance travelled (1/0)'),
  ('live_train_show_distance_remaining', 1, 'Show distance remaining (1/0)'),
  ('live_train_show_previous_station', 1, 'Show previous station (1/0)'),
  ('live_train_show_next_station', 1, 'Show next station (1/0)'),
  ('live_train_show_eta', 1, 'Show ETA (1/0)'),
  ('live_train_show_delay', 1, 'Show delay (1/0)'),
  ('live_train_show_route_timeline', 1, 'Show full route timeline (1/0)'),
  ('live_train_stale_threshold_minutes', 15, 'Minutes after which live data is marked stale'),
  ('live_train_failure_fallback_minutes', 60, 'Minutes to keep showing last good data after API failure')
ON CONFLICT (key) DO NOTHING;