-- ============================================================================
-- 0037 — Child-session Board reads must not be STABLE (D-97)
-- ============================================================================
--
-- Found in browser QA on staging: PostgREST runs a STABLE function inside a
-- READ-ONLY transaction, and the child-session check records the session's
-- use (an UPDATE). So `child_session_board_offers` and `child_session_board`
-- failed for every child with "cannot execute UPDATE in a read-only
-- transaction" — the child's Trail could not show an offer's state and the
-- child's Board was always empty. A local psql call is not read-only, which
-- is why the first regression checks passed; the regression now reproduces
-- PostgREST's read-only transaction for every child-session read.
--
-- Same signatures and grants; only the volatility changes.
-- ============================================================================

create or replace function child_session_board_offers(p_token text)
returns table (evidence_id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare v_child uuid;
begin
  v_child := assume_child_actor(p_token);
  return query select b.evidence_id, b.status from board_contributions b where b.child_id = v_child;
end;
$$;
revoke all on function child_session_board_offers(text) from public;
grant execute on function child_session_board_offers(text) to anon, authenticated;

create or replace function child_session_board(p_token text)
returns table (mission_slug text, mission_title text, lab wla_lab, text text, approach text, curated boolean, published_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query select * from private.board_for_child(assume_child_actor(p_token));
end;
$$;
revoke all on function child_session_board(text) from public;
grant execute on function child_session_board(text) to anon, authenticated;

