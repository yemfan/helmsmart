-- Correct a false claim in the brand library: "answers portal leads instantly".
--
-- Found by the Boss's fact-check on a real week, in a post NOT written by AI —
-- this one came from the original hand-written BRAND_POSTS and had been sitting
-- in the library since it was seeded. It was queued to publish.
--
-- The claim implies a Zillow / Realtor.com style portal-lead feed. There is no
-- such integration: MLS/IDX is explicitly on the NOT-TRUE list, and lead intake
-- is inbound calls, inbound SMS, Meta lead ads and CSV import. The only "portal"
-- anywhere in the codebase is a task title telling a HUMAN to post to portals
-- (lib/realtyboss/actions/registry.ts).
--
-- The replacement keeps the same speed-to-lead angle, but every claim in it maps
-- to a real line in lib/social/productFacts.ts:
--   "answers every inbound call 24/7"      -> AI Receptionist
--   "qualifies the caller on the spot"     -> AI Receptionist qualifies callers
--   "texts back"                           -> texts back calls it can't reach
--   "keeps calling until it connects"      -> missed-call callback ladder
--   "inbound texts get answered"           -> AI Sales Assistant replies to texts
--
-- Worth noting what this says about the gate: it was built because the AI
-- fabricated claims, and the first false claim it caught in production was a
-- human's.

update public.social_content_library
   set body = 'RealtyBoss answers every inbound call 24/7 and qualifies the caller on the spot. Miss one and it texts back, then keeps calling until it connects. Inbound texts get answered too — day or night, while you''re mid-showing.'
 where title = 'brand:speed_to_lead'
   and category = 'brand'
   and agent_id is not null
   and body like '%portal leads%';
