-- Pooled credits are withdrawn. In a real brokerage every agent pays for their
-- own usage — even office colour printing is charged or capped — so a switch
-- that spends the owner's balance for members misreads the market. The code
-- that read this column is gone (revert of #1673); a setting nothing reads
-- should not exist either.

alter table public.teams drop column if exists pooled_credits;
