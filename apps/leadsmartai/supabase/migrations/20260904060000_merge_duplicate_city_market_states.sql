-- Collapse city_market_data rows duplicated by state SPELLING.
--
-- `normalizeCityState` uppercased the state and never mapped a full name to
-- its code, so "California" stayed "CALIFORNIA" and became a second key under
-- the (city, state) unique constraint. 21 cities were carrying two rows each,
-- 33 rows in all with a long state name:
--
--   beverly hills   CA=ai_web_search/4047973   |  CALIFORNIA=fallback/803273
--   alhambra        CALIFORNIA=fallback/846156 |  CA=fallback/348792
--   detroit         MI=seed/190000             |  MICHIGAN=fallback/327607
--
-- Alhambra holds two DIFFERENT invented medians because buildFallbackCityData
-- hashes "city|state", and the two spellings hash apart.
--
-- Two costs. The refresh plan spends an AI call on each half of every pair, and
-- `get_market_snapshot` picks by last_fetched_at, so Beverly Hills could answer
-- from the CALIFORNIA placeholder rather than the real $4.05m row. The source
-- gate keeps that safe by withholding the placeholder, but it makes the tool
-- say "no data" about a market that has a current figure.
--
-- Every one of the 21 pairs was checked to be one state in two spellings --
-- TX+TEXAS, OH+OHIO, CA+CALIFORNIA -- and not two genuinely different states.
-- Arlington is TX+TEXAS, not TX+VA. Nothing here merges distinct places.
--
-- The winner is the measured row where one exists, then the row already keyed
-- by the two-letter code. Where both are placeholders their medians are
-- equally untrue and the source gate withholds either, so the tie-break is the
-- canonical key rather than the newer fiction. San Marino is why measured wins
-- first: its only real figure ($3.4m) sits on the CALIFORNIA row, which wins
-- and is then renamed to CA.
--
-- Re-running is a no-op: with no duplicates left the delete matches nothing,
-- and with no long names left the update matches nothing.

begin;

create temporary table _state_codes (name text primary key, code text not null) on commit drop;

insert into _state_codes (name, code) values
  ('ALABAMA','AL'),('ALASKA','AK'),('ARIZONA','AZ'),('ARKANSAS','AR'),
  ('CALIFORNIA','CA'),('COLORADO','CO'),('CONNECTICUT','CT'),('DELAWARE','DE'),
  ('DISTRICT OF COLUMBIA','DC'),('FLORIDA','FL'),('GEORGIA','GA'),('HAWAII','HI'),
  ('IDAHO','ID'),('ILLINOIS','IL'),('INDIANA','IN'),('IOWA','IA'),
  ('KANSAS','KS'),('KENTUCKY','KY'),('LOUISIANA','LA'),('MAINE','ME'),
  ('MARYLAND','MD'),('MASSACHUSETTS','MA'),('MICHIGAN','MI'),('MINNESOTA','MN'),
  ('MISSISSIPPI','MS'),('MISSOURI','MO'),('MONTANA','MT'),('NEBRASKA','NE'),
  ('NEVADA','NV'),('NEW HAMPSHIRE','NH'),('NEW JERSEY','NJ'),('NEW MEXICO','NM'),
  ('NEW YORK','NY'),('NORTH CAROLINA','NC'),('NORTH DAKOTA','ND'),('OHIO','OH'),
  ('OKLAHOMA','OK'),('OREGON','OR'),('PENNSYLVANIA','PA'),('PUERTO RICO','PR'),
  ('RHODE ISLAND','RI'),('SOUTH CAROLINA','SC'),('SOUTH DAKOTA','SD'),
  ('TENNESSEE','TN'),('TEXAS','TX'),('UTAH','UT'),('VERMONT','VT'),
  ('VIRGINIA','VA'),('WASHINGTON','WA'),('WEST VIRGINIA','WV'),
  ('WISCONSIN','WI'),('WYOMING','WY');

-- Losers: every row but the best one in each (city, canonical state) group.
delete from city_market_data d
using (
  select id
  from (
    select d2.id,
           row_number() over (
             partition by lower(d2.city), coalesce(sc.code, upper(d2.state))
             order by (d2.source = 'ai_web_search') desc,
                      (length(d2.state) = 2) desc,
                      d2.last_fetched_at desc
           ) as rn
    from city_market_data d2
    left join _state_codes sc on sc.name = upper(d2.state)
  ) ranked
  where ranked.rn > 1
) loser
where d.id = loser.id;

-- Survivors carry the code, so a later refresh writes back to the same key.
update city_market_data d
set state = sc.code
from _state_codes sc
where upper(d.state) = sc.name
  and d.state <> sc.code;

commit;
