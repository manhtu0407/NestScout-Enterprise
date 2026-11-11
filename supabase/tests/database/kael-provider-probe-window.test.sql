begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select ok(not has_function_privilege('anon', 'public.kael_claim_provider_probe()', 'execute'),
  'Anonymous role cannot claim a provider probe');
select ok(not has_function_privilege('authenticated', 'public.kael_claim_provider_probe()', 'execute'),
  'Signed-in users cannot claim a provider probe');
select ok(has_function_privilege('service_role', 'public.kael_claim_provider_probe()', 'execute'),
  'The Edge Function service role can claim a provider probe');
select ok(not has_table_privilege('service_role', 'nestscout_private.kael_provider_probe_window', 'select'),
  'The window table is reachable only through the claim function');

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(public.kael_claim_provider_probe(), true, 'The first claim is granted');
select is(public.kael_claim_provider_probe(), false, 'A second claim inside the window is refused for every caller');
reset role;

update nestscout_private.kael_provider_probe_window set claimed_at = clock_timestamp() - interval '61 seconds';
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(public.kael_claim_provider_probe(), true, 'A claim is granted again after the window expires');
select is(public.kael_claim_provider_probe(), false, 'The renewed window refuses further claims');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select throws_ok($$select public.kael_claim_provider_probe()$$, '42501', null, 'An authenticated caller is denied by privilege');
reset role;

select * from finish();
rollback;
