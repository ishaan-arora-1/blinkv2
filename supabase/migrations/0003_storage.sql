-- ============================================================================
-- reelmint · 0003_storage
-- Private buckets for user media, with owner-folder access policies.
--
-- Both buckets are private. Everything the browser displays is fetched through
-- a short-lived signed URL, so a leaked path is not a leaked asset.
--
-- Path convention — the first folder segment is the owner's uid, which is what
-- every policy below keys on:
--   uploads/{user_id}/sets/{set_id}/{uuid}.jpg
--   uploads/{user_id}/demos/{uuid}.mp4
--   generations/{user_id}/blinks/{blink_id}.mp4
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'uploads',
    'uploads',
    false,
    524288000, -- 500 MB: screen recordings of a full app walkthrough get big
    array['image/png','image/jpeg','image/webp','image/gif',
          'video/mp4','video/quicktime','video/webm']
  ),
  (
    'generations',
    'generations',
    false,
    524288000,
    array['video/mp4','video/webm']
  )
on conflict (id) do update
  set file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ─── uploads: the user owns their folder outright ───────────────────────────

create policy "uploads: owner reads" on storage.objects
  for select to authenticated
  using (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "uploads: owner writes" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "uploads: owner updates" on storage.objects
  for update to authenticated
  using (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "uploads: owner deletes" on storage.objects
  for delete to authenticated
  using (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text);

-- ─── generations: read-only to the user ─────────────────────────────────────
-- Written exclusively by the API server (service role) after it pulls the
-- finished render from Veo. A user may read and delete their own, never create
-- one — that would let someone fabricate a generation they did not pay for.

create policy "generations: owner reads" on storage.objects
  for select to authenticated
  using (bucket_id = 'generations' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "generations: owner deletes" on storage.objects
  for delete to authenticated
  using (bucket_id = 'generations' and (storage.foldername(name))[1] = auth.uid()::text);
