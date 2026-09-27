-- Six Names — mission cover image.
--
-- The public site leads every mission card with a photograph; it is the card,
-- since no border, fill or shadow is drawn around one. The artwork for Six
-- Names was supplied by the client on 2026-09-27 and lives at
-- public/missions/six-names.jpg.
--
-- NOT YET APPLIED to staging. Writing to the hosted project has not been
-- authorised for this change, so src/features/missions/covers.ts carries the
-- same value locally and the card renders correctly either way. Once this is
-- applied, the entry in that file can be deleted with no other change.
--
-- Idempotent: safe to re-run, and it will not overwrite a value set later by
-- the CMS.

update public.missions
set cover_image = '/missions/six-names.jpg',
    updated_at = now()
where slug = 'six-names'
  and cover_image is null;
