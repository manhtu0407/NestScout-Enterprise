create or replace function public.accept_service_invitation(p_invitation_id uuid, p_quote_id uuid, p_quote_version integer)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return nestscout_private.accept_service_invitation(p_invitation_id, p_quote_id, p_quote_version);
exception when serialization_failure then
  raise sqlstate 'PGRST' using message = nestscout_private.conflict_body(sqlerrm), detail = '{"status":409,"headers":{}}';
end;
$$;

create or replace function public.accept_service_quote(p_quote_id uuid, p_version integer)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return nestscout_private.accept_service_quote(p_quote_id, p_version);
exception when serialization_failure then
  raise sqlstate 'PGRST' using message = nestscout_private.conflict_body(sqlerrm), detail = '{"status":409,"headers":{}}';
end;
$$;

create or replace function public.advance_service_job(p_job_id uuid, p_version integer, p_next text)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return nestscout_private.advance_service_job(p_job_id, p_version, p_next);
exception when serialization_failure then
  raise sqlstate 'PGRST' using message = nestscout_private.conflict_body(sqlerrm), detail = '{"status":409,"headers":{}}';
end;
$$;

create or replace function public.cancel_service_request(p_request_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return nestscout_private.cancel_service_request(p_request_id);
exception when serialization_failure then
  raise sqlstate 'PGRST' using message = nestscout_private.conflict_body(sqlerrm), detail = '{"status":409,"headers":{}}';
end;
$$;

create or replace function public.consent_service_resume(p_job_id uuid, p_version integer)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return nestscout_private.consent_service_resume(p_job_id, p_version);
exception when serialization_failure then
  raise sqlstate 'PGRST' using message = nestscout_private.conflict_body(sqlerrm), detail = '{"status":409,"headers":{}}';
end;
$$;

create or replace function public.decide_service_scope(p_proposal_id uuid, p_job_version integer, p_sequence integer, p_decision text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return nestscout_private.decide_service_scope(p_proposal_id, p_job_version, p_sequence, p_decision);
exception when serialization_failure then
  raise sqlstate 'PGRST' using message = nestscout_private.conflict_body(sqlerrm), detail = '{"status":409,"headers":{}}';
end;
$$;

create or replace function public.decide_service_submission(p_submission_id uuid, p_version integer, p_decision text, p_reason text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return nestscout_private.decide_service_submission(p_submission_id, p_version, p_decision, p_reason);
exception when serialization_failure then
  raise sqlstate 'PGRST' using message = nestscout_private.conflict_body(sqlerrm), detail = '{"status":409,"headers":{}}';
end;
$$;

create or replace function public.decline_service_invitation(p_invitation_id uuid, p_quote_id uuid, p_quote_version integer)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return nestscout_private.decline_service_invitation(p_invitation_id, p_quote_id, p_quote_version);
exception when serialization_failure then
  raise sqlstate 'PGRST' using message = nestscout_private.conflict_body(sqlerrm), detail = '{"status":409,"headers":{}}';
end;
$$;

create or replace function public.escalate_service_job(p_request_id uuid, p_key uuid, p_note text DEFAULT NULL::text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return nestscout_private.escalate_service_job(p_request_id, p_key, p_note);
exception when serialization_failure then
  raise sqlstate 'PGRST' using message = nestscout_private.conflict_body(sqlerrm), detail = '{"status":409,"headers":{}}';
end;
$$;

create or replace function public.invite_fixture_worker(p_request_id uuid, p_worker_id uuid, p_valid_minutes integer)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return nestscout_private.invite_fixture_worker(p_request_id, p_worker_id, p_valid_minutes);
exception when serialization_failure then
  raise sqlstate 'PGRST' using message = nestscout_private.conflict_body(sqlerrm), detail = '{"status":409,"headers":{}}';
end;
$$;

create or replace function public.pause_service_job(p_job_id uuid, p_version integer, p_category text)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return nestscout_private.pause_service_job(p_job_id, p_version, p_category);
exception when serialization_failure then
  raise sqlstate 'PGRST' using message = nestscout_private.conflict_body(sqlerrm), detail = '{"status":409,"headers":{}}';
end;
$$;

create or replace function public.propose_service_scope(p_job_id uuid, p_version integer, p_key uuid, p_scope text, p_amount bigint, p_rationale text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return nestscout_private.propose_service_scope(p_job_id, p_version, p_key, p_scope, p_amount, p_rationale);
exception when serialization_failure then
  raise sqlstate 'PGRST' using message = nestscout_private.conflict_body(sqlerrm), detail = '{"status":409,"headers":{}}';
end;
$$;

create or replace function public.redispatch_service_request(p_request_id uuid, p_expected_round integer DEFAULT NULL::integer)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return nestscout_private.redispatch_service_request(p_request_id, p_expected_round);
exception when serialization_failure then
  raise sqlstate 'PGRST' using message = nestscout_private.conflict_body(sqlerrm), detail = '{"status":409,"headers":{}}';
end;
$$;

create or replace function public.reject_service_quote(p_quote_id uuid, p_version integer)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return nestscout_private.reject_service_quote(p_quote_id, p_version);
exception when serialization_failure then
  raise sqlstate 'PGRST' using message = nestscout_private.conflict_body(sqlerrm), detail = '{"status":409,"headers":{}}';
end;
$$;

create or replace function public.release_service_job(p_job_id uuid, p_version integer, p_key uuid, p_reason text, p_note text DEFAULT NULL::text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return nestscout_private.release_service_job(p_job_id, p_version, p_key, p_reason, p_note);
exception when serialization_failure then
  raise sqlstate 'PGRST' using message = nestscout_private.conflict_body(sqlerrm), detail = '{"status":409,"headers":{}}';
end;
$$;

create or replace function public.report_service_job(p_job_id uuid, p_version integer, p_key uuid, p_kind text, p_details text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return nestscout_private.report_service_job(p_job_id, p_version, p_key, p_kind, p_details);
exception when serialization_failure then
  raise sqlstate 'PGRST' using message = nestscout_private.conflict_body(sqlerrm), detail = '{"status":409,"headers":{}}';
end;
$$;

create or replace function public.request_service_reassignment(p_request_id uuid, p_key uuid, p_note text DEFAULT NULL::text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return nestscout_private.request_service_reassignment(p_request_id, p_key, p_note);
exception when serialization_failure then
  raise sqlstate 'PGRST' using message = nestscout_private.conflict_body(sqlerrm), detail = '{"status":409,"headers":{}}';
end;
$$;

create or replace function public.request_service_resume(p_job_id uuid, p_version integer)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return nestscout_private.request_service_resume(p_job_id, p_version);
exception when serialization_failure then
  raise sqlstate 'PGRST' using message = nestscout_private.conflict_body(sqlerrm), detail = '{"status":409,"headers":{}}';
end;
$$;

create or replace function public.resolve_service_escalation(p_escalation_id uuid, p_resolution text, p_note text, p_key uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return nestscout_private.resolve_service_escalation(p_escalation_id, p_resolution, p_note, p_key);
exception when serialization_failure then
  raise sqlstate 'PGRST' using message = nestscout_private.conflict_body(sqlerrm), detail = '{"status":409,"headers":{}}';
end;
$$;

create or replace function public.retry_service_dispatch(p_request_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return nestscout_private.retry_service_dispatch(p_request_id);
exception when serialization_failure then
  raise sqlstate 'PGRST' using message = nestscout_private.conflict_body(sqlerrm), detail = '{"status":409,"headers":{}}';
end;
$$;

create or replace function public.set_request_service(p_request_id uuid, p_service_id text)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return nestscout_private.set_request_service(p_request_id, p_service_id);
exception when serialization_failure then
  raise sqlstate 'PGRST' using message = nestscout_private.conflict_body(sqlerrm), detail = '{"status":409,"headers":{}}';
end;
$$;

create or replace function public.submit_service_work(p_job_id uuid, p_version integer, p_key uuid, p_evidence text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return nestscout_private.submit_service_work(p_job_id, p_version, p_key, p_evidence);
exception when serialization_failure then
  raise sqlstate 'PGRST' using message = nestscout_private.conflict_body(sqlerrm), detail = '{"status":409,"headers":{}}';
end;
$$;

drop function nestscout_private.raise_conflict(text);
