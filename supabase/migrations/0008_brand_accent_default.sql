-- The brand accent default was the lime from the pre-rebrand palette, so every
-- new account started with a colour that clashed with the Blink UGC violet.
--
-- Rows still holding the old default are moved across as well: that value was
-- assigned by the database, not chosen by anyone. A brand that has picked any
-- other colour — including a different green — is left alone.

alter table public.brands alter column accent set default '#c9a4ff';

update public.brands set accent = '#c9a4ff' where accent = '#d6f65c';
