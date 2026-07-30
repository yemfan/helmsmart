-- social_ads stored every AdInput field as a column EXCEPT `theme`, so the
-- render-by-id route (getAdForRender) always fell back to the default navy —
-- the composer's theme pick and the weekly rotation's theme were both lost on
-- render. Add the column so the chosen theme persists and renders. Additive.

alter table public.social_ads add column if not exists theme text;
