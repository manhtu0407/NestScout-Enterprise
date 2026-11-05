begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, aud, role) values
  ('80850000-0000-4000-8000-000000000001','authenticated','authenticated'),
  ('80850000-0000-4000-8000-000000000002','authenticated','authenticated');
insert into public.kael_conversations (id,owner_id,mode) values
  ('80850000-0000-4000-8000-000000000003','80850000-0000-4000-8000-000000000001','client');
insert into public.kael_runs (id,conversation_id,owner_id,request_id) values
  ('80850000-0000-4000-8000-000000000004','80850000-0000-4000-8000-000000000003','80850000-0000-4000-8000-000000000001',gen_random_uuid());
insert into nestscout_private.kael_pilot_budgets
  (id,actors,expires_at,cap_micro_usd,max_calls,input_rate,cached_rate,output_rate,rate_source,rates_checked_at,source_sha,stack_id)
  values ('80850000-0000-4000-8000-000000000005',array['80850000-0000-4000-8000-000000000001']::uuid[],now()+interval '30 minutes',
    1000000,20,0.3,0.006,1.2,'https://api-docs.deepseek.com/quick_start/pricing/',now(),repeat('a',40),'test-stack');

select ok(not has_table_privilege('authenticated','nestscout_private.kael_pilot_budgets','select'), 'No direct client access to budgets');
select ok(not has_table_privilege('service_role','nestscout_private.kael_pilot_calls','insert'), 'Server uses the bounded accounting RPC only');
select ok(not has_function_privilege('authenticated','public.kael_pilot_charge(uuid,uuid,uuid,uuid,text,boolean,text,integer,integer,integer)','execute'), 'Clients cannot reserve or reconcile spend');
select ok(not has_function_privilege('anon','public.kael_pilot_status()','execute'), 'Guest cannot inspect pilot status');
select throws_ok($$ update nestscout_private.kael_pilot_budgets set cap_micro_usd=1000001 where id='80850000-0000-4000-8000-000000000005' $$, '23514', null, 'The pilot cannot exceed the USD 1 authority');
select throws_ok($$ update nestscout_private.kael_pilot_budgets set input_rate=0 where id='80850000-0000-4000-8000-000000000005' $$, '23514', null, 'Zero or missing pricing cannot authorize calls');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"80850000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is(public.kael_pilot_status()->'budgets','[]'::jsonb,'Another account cannot see the budget');
select is(public.kael_pilot_status()->'calls','[]'::jsonb,'Another account cannot see call evidence');
select throws_ok($$ select public.kael_pilot_charge(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'reserve',false,'deepseek-flash',0,0,0) $$,
  '42501', null, 'An authenticated client cannot invoke accounting');
reset role;

create function pg_temp.charge(action text, call_id uuid default '80850000-0000-4000-8000-000000000006',
  model text default 'deepseek-flash', input_tokens integer default 100, cached integer default 40, output_tokens integer default 10)
returns jsonb language sql as $$ select public.kael_pilot_charge('80850000-0000-4000-8000-000000000005',
  '80850000-0000-4000-8000-000000000001','80850000-0000-4000-8000-000000000004',call_id,action,false,model,input_tokens,cached,output_tokens); $$;

set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select is(pg_temp.charge('reserve')->>'ok','false','New budget is disabled by default');
reset role;
update nestscout_private.kael_pilot_budgets set enabled=true where id='80850000-0000-4000-8000-000000000005';
set local role service_role;
select is(public.kael_pilot_charge('80850000-0000-4000-8000-000000000005','80850000-0000-4000-8000-000000000002',
  '80850000-0000-4000-8000-000000000004',gen_random_uuid(),'reserve',false,'deepseek-flash',0,0,0)->>'ok','false','Foreign actor cannot charge the owner budget');
select is(pg_temp.charge('reserve',model=>'deepseek-v4-pro')->>'ok','false','Unapproved Pro cannot reserve');
select is(pg_temp.charge('reserve')->>'ok','true','Authorized Flash reserves before transport');
select is(pg_temp.charge('reserve')->>'ok','false','Duplicate reservation cannot dispatch twice');
select is(pg_temp.charge('reserve',gen_random_uuid())->>'ok','false','An outstanding reservation blocks another worker');
select is(pg_temp.charge('settle',model=>'DeepSeek-V4.1-Flash-1017')->>'estimated_micro_usd','31','Cache classes reconcile with conservative rounded-up cost');
select is(pg_temp.charge('settle')->>'ok','false','Settlement replay cannot release or change spend');
reset role;
select is((select estimated_micro_usd from nestscout_private.kael_pilot_calls where pilot_id='80850000-0000-4000-8000-000000000005'),31::bigint,'Real charged-call evidence is durable');
select is((select reserved_micro_usd from nestscout_private.kael_pilot_calls where pilot_id='80850000-0000-4000-8000-000000000005'),319488::bigint,'Reservation covers maximum model context and output');
update nestscout_private.kael_pilot_budgets set cap_micro_usd=319500 where id='80850000-0000-4000-8000-000000000005';
set local role service_role;
select is(pg_temp.charge('reserve',gen_random_uuid())->>'ok','false','Prior spend plus maximum reservation cannot exceed cap');
reset role;
update nestscout_private.kael_pilot_budgets set cap_micro_usd=1000000,rates_checked_at=now()-interval '25 hours' where id='80850000-0000-4000-8000-000000000005';
set local role service_role;
select is(pg_temp.charge('reserve',gen_random_uuid())->>'ok','false','Stale prices deny the next paid request');
reset role;
update nestscout_private.kael_pilot_budgets set rates_checked_at=now(),expires_at=now()-interval '1 second' where id='80850000-0000-4000-8000-000000000005';
set local role service_role;
select is(pg_temp.charge('reserve',gen_random_uuid())->>'ok','false','Expired authority denies the next paid request');
reset role;
update nestscout_private.kael_pilot_budgets set expires_at=now()+interval '30 minutes',max_calls=1 where id='80850000-0000-4000-8000-000000000005';
set local role service_role;
select is(pg_temp.charge('reserve',gen_random_uuid())->>'ok','false','Request cap includes prior calls after worker restart');
reset role;
update nestscout_private.kael_pilot_budgets set max_calls=20 where id='80850000-0000-4000-8000-000000000005';
set local role service_role;
select is(pg_temp.charge('reserve','80850000-0000-4000-8000-000000000007')->>'ok','true','A reconciled call permits the next reservation');
select is(pg_temp.charge('settle','80850000-0000-4000-8000-000000000007',input_tokens=>-1)->>'ok','false','Invalid usage cannot release a reservation');
select is(pg_temp.charge('reserve',gen_random_uuid())->>'ok','false','Unknown usage halts the pilot');
reset role;
select ok((select halted from nestscout_private.kael_pilot_budgets where id='80850000-0000-4000-8000-000000000005'),'The halt persists independently of Edge workers');
select is((select status from nestscout_private.kael_pilot_calls where id='80850000-0000-4000-8000-000000000007'),'uncertain','Uncertain call retains worst-case hold');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"80850000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(jsonb_array_length(public.kael_pilot_status()->'calls'),2,'Actor can read its sanitized call evidence');
select ok(not ((public.kael_pilot_status()->'budgets'->0) ? 'actors'),'Status does not leak another actor identity');
select ok(not (public.kael_pilot_status()::text like '%test-stack%'),'Status does not expose private stack configuration');
reset role;
update nestscout_private.kael_pilot_budgets set halted=false where id='80850000-0000-4000-8000-000000000005';
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select is(pg_temp.charge('uncertain')->>'ok','false','A lost settlement acknowledgement requests a durable halt');
reset role;
select ok((select halted from nestscout_private.kael_pilot_budgets where id='80850000-0000-4000-8000-000000000005'),'Uncertainty halts even after settlement committed');
select is((select estimated_micro_usd from nestscout_private.kael_pilot_calls where id='80850000-0000-4000-8000-000000000006'),31::bigint,
  'Known committed accounting is preserved when its HTTP acknowledgement was lost');
select * from finish();
rollback;
