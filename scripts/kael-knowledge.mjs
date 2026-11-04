import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { knowledgeSeedSnapshot, knowledgeSnapshot, sourceRegistry } from '../services/kael-core/src/knowledge-sources.ts';
import { canonicalJson, fingerprint } from '../services/kael-core/src/policy.ts';
import { databaseContainer } from './postgresql-clients.mjs';
import { localRuntime, localEnvironment, requireLocal, safeDiagnostic, withLocalLock } from './supabase-local.mjs';
import { dockerTarget } from './tool-doctor.mjs';

export function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function knowledgeSeedSql(snapshot) {
  return snapshot.map(({ content_hash, normalized_text, normalized_aliases, corpus_version, ...source }) => {
    const aliases = `array[${normalized_aliases.map(sqlLiteral).join(',')}]::text[]`;
    return `select nestscout_private.ingest_kael_knowledge(${sqlLiteral(canonicalJson(source))}, ${sqlLiteral(normalized_text)}, ${aliases}, ${sqlLiteral(corpus_version)});`;
  }).join('\n');
}

export function localKnowledgeDatabase() {
  const runtime = localRuntime();
  const verified = runtime.verify();
  const status = runtime.status();
  requireLocal(verified.id === status.identity.id, 'Local stack identity changed.');
  const target = dockerTarget();
  const command = (args, input) => {
    const result = spawnSync('docker', ['--context', target.context, ...args], {
      env: localEnvironment(process.env), encoding: 'utf8', input, timeout: 60000,
      maxBuffer: 16 * 1024 * 1024, shell: false, windowsHide: true,
    });
    requireLocal(!result.error && !result.signal && result.status === 0, `Knowledge SQL failed (exit ${result.status ?? 'unavailable'}): ${String(result.stderr).replace(/DETAIL:[\s\S]*/m, '').slice(0, 1000)}`);
    return result.stdout;
  };
  const ids = command(['ps', '--filter', `label=com.supabase.stack=${verified.id}`, '--format', '{{.ID}}']).trim().split(/\s+/);
  const containers = JSON.parse(command(['inspect', ...ids]));
  const databases = status.services.filter(service => service.service === 'database');
  requireLocal(databases.length === 1, 'Expected one owned database service.');
  const container = databaseContainer(containers, { ...verified, databaseInstance: databases[0].id });
  const sqlArgs = ['exec', '-i', container, 'psql', '-X', '-w', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq', '-f', '-'];
  return {
    query(sql) {
      requireLocal(runtime.verify().id === verified.id, 'Local stack changed before SQL.');
      const result = command(sqlArgs, sql);
      requireLocal(runtime.verify().id === verified.id, 'Local stack changed after SQL.');
      return result;
    },
    concurrentTransaction(sql) {
      requireLocal(runtime.verify().id === verified.id, 'Local stack changed before concurrent SQL.');
      const child = spawn('docker', ['--context', target.context, ...sqlArgs], { env: localEnvironment(process.env), shell: false, windowsHide: true, timeout: 45000 });
      let ended = false;
      const done = new Promise((resolve, reject) => {
        let text = '';
        child.stdout.on('data', chunk => { text += chunk; });
        child.stderr.resume();
        child.on('error', reject);
        child.stdin.on('error', reject);
        child.on('close', (code, signal) => {
          try {
            requireLocal(code === 0 && !signal, 'Concurrent knowledge SQL failed.');
            requireLocal(runtime.verify().id === verified.id, 'Local stack changed after concurrent SQL.');
            resolve(text);
          } catch (error) { reject(error); }
        });
      });
      void done.catch(() => undefined);
      child.stdin.write(`set statement_timeout = '30s';\nbegin;\n${sql}\n`);
      const finish = command => {
        if (!ended) { ended = true; child.stdin.end(`${command};\n`); }
      };
      return { done, commit: () => finish('commit'), rollback: () => finish('rollback') };
    },
    identity: verified.id,
  };
}

export function scoreRetrieval(rows, probes, strategy) {
  const results = rows.filter(row => row.strategy === strategy);
  const positives = probes.filter(probe => probe.expected.length > 0);
  const recall = k => positives.reduce((sum, probe) => {
    const found = results.find(row => row.id === probe.id).result.items.slice(0, k).map(item => item.source_id);
    return sum + probe.expected.filter(id => found.includes(id)).length / probe.expected.length;
  }, 0) / positives.length;
  const reciprocal = positives.reduce((sum, probe) => {
    const found = results.find(row => row.id === probe.id).result.items.findIndex(item => probe.expected.includes(item.source_id));
    return sum + (found >= 0 ? 1 / (found + 1) : 0);
  }, 0) / positives.length;
  const empty = results.filter(row => row.result.items.length === 0);
  const correctEmpty = empty.filter(row => probes.find(probe => probe.id === row.id).expected.length === 0);
  const latencies = results.map(row => row.latency_ms).sort((a, b) => a - b);
  const items = results.flatMap(row => row.result.items);
  const safety = probes.filter(probe => probe.category === 'safety');
  return {
    strategy, probes: results.length, positive_probes: positives.length, recall_at_3: recall(3), recall_at_5: recall(5), mrr_at_10: reciprocal,
    no_result_precision: empty.length ? correctEmpty.length / empty.length : null, empty_results: empty.length,
    false_positive_no_match_queries: results.filter(row => probes.find(probe => probe.id === row.id).expected.length === 0 && row.result.items.length > 0).map(row => row.id),
    duplicate_source_rate: results.reduce((sum, row) => sum + row.result.items.length - new Set(row.result.items.map(item => item.source_id)).size, 0) / Math.max(items.length, 1),
    p50_sql_ms: latencies[Math.ceil(latencies.length * 0.5) - 1], p95_sql_ms: latencies[Math.ceil(latencies.length * 0.95) - 1],
    returned_sources: items.length, tool_calls: results.length,
    safety_probes: safety.length, safety_recall_at_5: safety.length ? safety.reduce((sum, probe) => sum + probe.expected.filter(id => results.find(row => row.id === probe.id).result.items.slice(0, 5).some(item => item.source_id === id)).length / probe.expected.length, 0) / safety.length : null,
    misses_at_5: positives.filter(probe => !probe.expected.every(id => results.find(row => row.id === probe.id).result.items.slice(0, 5).some(item => item.source_id === id))).map(probe => probe.id),
  };
}

export async function benchmarkKnowledge(database) {
  const expectedSnapshot = await knowledgeSnapshot();
  const actualSnapshot = JSON.parse(database.query(`select coalesce(jsonb_agg(jsonb_build_object('source_id', source_id, 'revision', revision, 'content_hash', content_hash, 'publication', publication, 'corpus_version', corpus_version, 'normalized_text', normalized_text, 'normalized_aliases', normalized_aliases) order by source_id), '[]'::jsonb) from public.kael_knowledge_sources where is_current;`));
  const expected = expectedSnapshot.map(({ source_id, revision, content_hash, publication, corpus_version, normalized_text, normalized_aliases }) => ({ source_id, revision, content_hash, publication, corpus_version, normalized_text, normalized_aliases }));
  requireLocal(canonicalJson(actualSnapshot) === canonicalJson(expected), 'Benchmark database differs from validated corpus; seed the exact current snapshot without unrelated sources.');
  const probes = JSON.parse(readFileSync(new URL('./kael-retrieval-probes.json', import.meta.url), 'utf8'));
  requireLocal(probes.length >= 60 && new Set(probes.map(probe => probe.id)).size === probes.length, 'Invalid held-out probes.');
  const output = database.query(`begin;
insert into auth.users (id, aud, role) values ('00000000-0000-4000-8000-00000000aa01', 'authenticated', 'authenticated') on conflict do nothing;
create temp table kael_benchmark_results (id text, strategy text, result jsonb, latency_ms double precision);
grant all on kael_benchmark_results to authenticated;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000aa01","role":"authenticated","is_anonymous":false}', true) is not null;
do $benchmark$
declare v_probe jsonb; v_strategy text; v_start timestamptz; v_result jsonb;
begin
  for v_probe in select value from jsonb_array_elements(${sqlLiteral(JSON.stringify(probes))}::jsonb) loop
    foreach v_strategy in array array['exact_alias', 'lexical'] loop
      v_start := clock_timestamp();
      v_result := public.kael_knowledge_search(v_probe ->> 'query', 10, null, v_strategy);
      insert into kael_benchmark_results values (v_probe ->> 'id', v_strategy, v_result, extract(epoch from clock_timestamp() - v_start) * 1000);
    end loop;
  end loop;
end;
$benchmark$;
select jsonb_agg(to_jsonb(r)) from kael_benchmark_results r;
rollback;`);
  const rows = JSON.parse(output.trim().split('\n').at(-1));
  const snapshot = await sourceRegistry();
  return {
    evidence_type: 'local_postgres_real_sql', measured_at: new Date().toISOString(), corpus_version: snapshot.corpus_version, corpus_hash: snapshot.content_hash,
    retrieval_implementation: 'lexical-v1', migration_hash: await fingerprint(readFileSync(new URL('../supabase/migrations/20261104140804_protect_kael_price_priors.sql', import.meta.url), 'utf8')),
    probe_hash: await fingerprint(probes),
    probe_provenance: 'agent_authored_separately_from_corpus; agent_validated; not_human_reviewed',
    environment: { platform: `${os.platform()} ${os.release()}`, cpu: os.cpus()[0]?.model, logical_cpus: os.cpus().length, memory_gib: Math.round(os.totalmem() / 1024 ** 3), node: process.version, postgres: database.query('show server_version;').trim(), latency_scope: 'SQL function only; excludes transport and model generation; one ordered pass, exact_alias then lexical per probe' },
    semantic_hybrid: 'NOT IMPLEMENTED / NOT RUN; no embeddings or paid calls',
    response_quality: 'NOT RUN; retrieval is not generated-answer groundedness or human review',
    metrics: ['exact_alias', 'lexical'].map(strategy => scoreRetrieval(rows, probes, strategy)),
    results: rows.map(row => ({ id: row.id, strategy: row.strategy, latency_ms: row.latency_ms, status: row.result.status, sources: row.result.items.map(item => item.source_id) })),
  };
}

async function main(action) {
  requireLocal(['validate', 'seed', 'benchmark'].includes(action) && process.argv.length === 3, 'Use validate, seed or benchmark without target overrides.');
  if (action === 'validate') {
    console.log(JSON.stringify(await sourceRegistry(), null, 2));
    return;
  }
  await withLocalLock(async () => {
    const database = localKnowledgeDatabase();
    if (action === 'seed') {
      const snapshot = await knowledgeSeedSnapshot();
      database.query(`begin;\n${knowledgeSeedSql(snapshot)}\ncommit;`);
      const registry = await sourceRegistry();
      console.log(JSON.stringify({ status: 'PASS', source_count: registry.source_count, seeded_revisions: snapshot.length, registry }, null, 2));
    } else console.log(JSON.stringify(await benchmarkKnowledge(database), null, 2));
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(process.argv[2]); } catch (error) { console.error(safeDiagnostic(error)); process.exitCode = 1; }
}
