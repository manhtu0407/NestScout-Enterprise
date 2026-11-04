create function nestscout_private.knowledge_actor_valid()
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and coalesce(auth.jwt() ->> 'is_anonymous', 'false') = 'false'
    and exists (select 1 from auth.users u where u.id = auth.uid() and not coalesce(u.is_anonymous, false));
$$;
revoke all on function nestscout_private.knowledge_actor_valid() from public, anon, authenticated, service_role;
grant execute on function nestscout_private.knowledge_actor_valid() to authenticated;

create table public.kael_knowledge_sources (
  source_id text not null check (source_id ~ '^[a-z_]+\.[a-z0-9.-]+$' and char_length(source_id) <= 120),
  revision integer not null check (revision > 0),
  is_current boolean not null default true,
  source_kind text not null check (source_kind in ('synthetic_case', 'product_fact', 'policy_placeholder')),
  publication text not null check (publication in ('published', 'draft_unapproved', 'withdrawn')),
  visibility text not null check (visibility in ('public', 'customer', 'worker', 'owner', 'internal')),
  owner_id uuid references auth.users (id),
  locale text not null check (locale = 'vi-VN'),
  region text not null check (region = 'Ho Chi Minh City'),
  provenance text not null check (provenance in ('synthetic_seed', 'repository_contract', 'agent_draft')),
  review_state text not null check (review_state in ('repository_verified', 'agent_validated_provisional', 'unapproved')),
  effective_at timestamptz,
  expires_at timestamptz,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  corpus_version text not null check (char_length(corpus_version) between 1 and 80),
  source jsonb not null check (jsonb_typeof(source) = 'object' and pg_column_size(source) <= 32000),
  normalized_text text not null check (char_length(normalized_text) between 1 and 12000),
  normalized_aliases text[] not null check (cardinality(normalized_aliases) <= 20),
  search_vector tsvector generated always as (to_tsvector('simple'::regconfig, normalized_text)) stored,
  ingested_at timestamptz not null default clock_timestamp(),
  primary key (source_id, revision),
  check ((visibility = 'owner') = (owner_id is not null)),
  check (expires_at is null or (effective_at is not null and expires_at > effective_at)),
  check (publication <> 'published' or (effective_at is not null and review_state <> 'unapproved')),
  check ((source_kind <> 'synthetic_case' or (provenance = 'synthetic_seed' and review_state = 'agent_validated_provisional'
    and source ? 'source_uri' and source ->> 'source_uri' is null and jsonb_typeof(source -> 'case_data') = 'object'
    and source -> 'case_data' ->> 'case_id' = source_id and (source -> 'case_data' ->> 'revision')::integer = revision
    and source -> 'case_data' ->> 'provenance_type' = 'synthetic_seed'
    and source -> 'case_data' ->> 'review_state' = 'agent_validated_provisional'
    and jsonb_typeof(source -> 'case_data' -> 'safety_tags') = 'array'
    and jsonb_array_length(source -> 'case_data' -> 'safety_tags') > 0)) is true),
  check ((source_kind <> 'product_fact' or (provenance = 'repository_contract' and review_state = 'repository_verified' and source ->> 'source_uri' like 'repo:%')) is true),
  check (source_kind <> 'policy_placeholder' or (publication <> 'published' and provenance = 'agent_draft'))
);
create unique index kael_knowledge_one_current on public.kael_knowledge_sources (source_id) where is_current;
create index kael_knowledge_lexical on public.kael_knowledge_sources using gin (search_vector) where is_current and publication = 'published';
alter table public.kael_knowledge_sources enable row level security;
revoke all on public.kael_knowledge_sources from public, anon, authenticated, service_role;
grant select on public.kael_knowledge_sources to authenticated;
create policy kael_knowledge_visible on public.kael_knowledge_sources for select to authenticated
  using (nestscout_private.knowledge_actor_valid()
    and is_current and publication = 'published'
    and effective_at <= statement_timestamp() and (expires_at is null or expires_at > statement_timestamp())
    and (visibility in ('public', 'customer')
      or (visibility = 'worker' and nestscout_private.current_worker_eligible())
      or (visibility = 'owner' and owner_id = auth.uid())));

create function nestscout_private.ingest_kael_knowledge(p_document text, p_normalized text, p_aliases text[], p_corpus_version text)
returns text language plpgsql security invoker set search_path = ''
as $$
declare
  v_source jsonb := p_document::jsonb;
  v_id text := v_source ->> 'source_id';
  v_revision integer := (v_source ->> 'revision')::integer;
  v_hash text := encode(extensions.digest(convert_to(p_document, 'UTF8'), 'sha256'), 'hex');
  v_existing public.kael_knowledge_sources%rowtype;
  v_current public.kael_knowledge_sources%rowtype;
begin
  if v_id is null or v_revision is null then raise exception using errcode = '22023', message = 'invalid knowledge source'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_id, 71209));
  select * into v_existing from public.kael_knowledge_sources where source_id = v_id and revision = v_revision;
  if found then
    if v_existing.content_hash <> v_hash or v_existing.normalized_text <> p_normalized
      or v_existing.normalized_aliases <> p_aliases or v_existing.corpus_version <> p_corpus_version then
      raise exception using errcode = '22023', message = 'knowledge revision conflict';
    end if;
    return v_hash;
  end if;
  select * into v_current from public.kael_knowledge_sources where source_id = v_id and is_current for update;
  if (v_current.source_id is null and (v_revision <> 1 or v_source ->> 'supersedes_revision' is not null))
    or (v_current.source_id is not null and (v_revision <> v_current.revision + 1 or (v_source ->> 'supersedes_revision')::integer is distinct from v_current.revision)) then
    raise exception using errcode = '22023', message = 'knowledge revision sequence required';
  end if;
  update public.kael_knowledge_sources set is_current = false where source_id = v_id and is_current;
  insert into public.kael_knowledge_sources (source_id, revision, source_kind, publication, visibility, owner_id, locale, region,
    provenance, review_state, effective_at, expires_at, content_hash, corpus_version, source, normalized_text, normalized_aliases)
  values (v_id, v_revision, v_source ->> 'source_kind', v_source ->> 'publication', v_source ->> 'visibility', (v_source ->> 'owner_id')::uuid,
    v_source ->> 'locale', v_source ->> 'region', v_source ->> 'provenance', v_source ->> 'review_state',
    (v_source ->> 'effective_at')::timestamptz, (v_source ->> 'expires_at')::timestamptz, v_hash, p_corpus_version, v_source, p_normalized, p_aliases);
  return v_hash;
end;
$$;
revoke all on function nestscout_private.ingest_kael_knowledge(text, text, text[], text) from public, anon, authenticated, service_role;

create function public.kael_knowledge_search(p_query text, p_limit integer default 5, p_source_id text default null, p_strategy text default 'lexical')
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
    select s.*, (select count(*)::real from unnest(v_terms) t where s.search_vector @@ plainto_tsquery('simple', t)) / greatest(cardinality(v_terms), 1) as coverage,
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
