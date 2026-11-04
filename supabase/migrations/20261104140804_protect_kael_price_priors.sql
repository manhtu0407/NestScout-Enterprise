alter table public.kael_knowledge_sources add column public_source jsonb
  generated always as (case when source_kind = 'synthetic_case'
    then jsonb_set(source, '{case_data,price_prior}', 'null'::jsonb, false)
    else source end) stored;

revoke select on public.kael_knowledge_sources from public, anon, authenticated, service_role;
grant select (source_id, revision, is_current, source_kind, publication, visibility, owner_id, locale, region,
  provenance, review_state, effective_at, expires_at, content_hash, corpus_version, public_source,
  normalized_text, normalized_aliases, search_vector, ingested_at)
  on public.kael_knowledge_sources to authenticated;

create or replace function public.kael_knowledge_search(p_query text, p_limit integer default 5, p_source_id text default null, p_strategy text default 'lexical')
returns jsonb language plpgsql stable security invoker set search_path = ''
as $$
declare
  v_normalized text;
  v_terms text[];
  v_tsquery tsquery;
  v_items jsonb;
begin
  if not nestscout_private.knowledge_actor_valid() then
    raise exception using errcode = '42501', message = 'knowledge actor required';
  end if;
  if p_query is null or char_length(p_query) > 300 or p_limit is null or p_limit not between 1 and 10
    or p_strategy is null or p_strategy not in ('exact_alias', 'lexical')
    or (p_source_id is not null and (char_length(p_source_id) > 120 or p_source_id !~ '^[a-z_]+\.[a-z0-9.-]+$')) then
    raise exception using errcode = '22023', message = 'invalid knowledge query';
  end if;
  v_normalized := trim(regexp_replace(lower(translate(regexp_replace(normalize(p_query, NFD), U&'[\0300-\036f]', '', 'g'), 'đĐ', 'dd')), '[^a-z0-9]+', ' ', 'g'));
  select coalesce(array_agg(distinct term), array[]::text[]) into v_terms
    from unnest(string_to_array(v_normalized, ' ')) term where char_length(term) > 1
    and term <> all(string_to_array('toi minh ban nha bi la va cua cho co khong mot cac can giup voi nay thi khi nhu da dang hay ve o muon xin lam sao the nao duoc bao nhieu gia tien', ' '));
  if cardinality(v_terms) = 0 and p_source_id is null then
    return jsonb_build_object('status', 'no_reliable_match', 'items', '[]'::jsonb, 'method', p_strategy);
  end if;
  v_tsquery := case when cardinality(v_terms) > 0 then to_tsquery('simple', array_to_string(v_terms, ' | ')) else null end;
  with eligible as materialized (
    select s.source_id, s.revision, s.source_kind, s.locale, s.provenance, s.public_source as source, s.content_hash, s.corpus_version, s.effective_at, s.search_vector, (select count(*)::real from unnest(v_terms) t where s.search_vector @@ plainto_tsquery('simple', t)) / greatest(cardinality(v_terms), 1) as coverage,
      exists (select 1 from unnest(s.normalized_aliases) a where v_normalized = a or (' ' || v_normalized || ' ') like ('% ' || a || ' %')) as alias_match
    from public.kael_knowledge_sources s
    where s.is_current and s.publication = 'published' and s.locale = 'vi-VN' and s.region = 'Ho Chi Minh City'
      and (p_source_id is null or s.source_id = p_source_id)
      and (p_source_id is not null or s.search_vector @@ v_tsquery)
  ), ranked as (
    select *, coverage + case when alias_match then 1 else 0 end + coalesce(ts_rank_cd(search_vector, v_tsquery), 0) * 0.05 as score
    from eligible
    where p_source_id is not null or alias_match or (p_strategy = 'lexical' and cardinality(v_terms) >= 2 and coverage >= 0.45)
    order by score desc, source_id limit p_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'source_id', source_id, 'source_revision', revision, 'source_kind', source_kind,
    'title', source ->> 'title', 'excerpt', left(source ->> 'content', 1600),
    'locale', locale, 'trust_tier', case when provenance = 'repository_contract' then 'repository_verified' else 'provisional' end,
    'provenance', provenance, 'source_uri', source -> 'source_uri', 'content_hash', content_hash, 'corpus_version', corpus_version,
    'citation_ref', 'kael:' || source_id || '@' || revision || '#' || content_hash,
    'retrieval_method', p_strategy, 'relevance_score', score, 'valid_as_of', effective_at,
    'case_data', source -> 'case_data') order by score desc, source_id), '[]'::jsonb) into v_items from ranked;
  return jsonb_build_object('status', case when jsonb_array_length(v_items) > 0 then 'matched' else 'no_reliable_match' end, 'items', v_items, 'method', p_strategy);
end;
$$;
revoke all on function public.kael_knowledge_search(text, integer, text, text) from public, anon, authenticated, service_role;
grant execute on function public.kael_knowledge_search(text, integer, text, text) to authenticated;
