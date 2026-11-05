import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fingerprint } from '../services/kael-core/src/policy.ts';
import { loadFixture, validateScenarios } from './kael-intelligence-grading.mjs';

export const liveRubric = loadFixture('kael-live-rubric');

export async function anchorReviewSheet() {
  const scenarios = loadFixture('kael-intelligence-scenarios');
  const registry = loadFixture('kael-intelligence-registry');
  await validateScenarios(scenarios, registry, loadFixture('kael-intelligence-replays'));
  assert.equal(registry.anchors.length, 20);
  return {
    schema_version: 1,
    evidence_type: 'PENDING_HUMAN_REVIEW',
    dataset_hash: registry.dataset_hash,
    rubric_hash: await fingerprint(liveRubric),
    calibration_status: liveRubric.calibration_status,
    anchors: registry.anchors.map(id => {
      const scenario = scenarios.find(s => s.id === id);
      return {
        scenario_id: id, scenario_hash: registry.scenario_hashes[id], version: scenario.version,
        category: scenario.category, role: scenario.role, turns: structuredClone(scenario.turns),
        ground_truth: structuredClone(scenario.ground_truth), source_label_provenance: scenario.label_provenance,
        review_status: 'PENDING_HUMAN_REVIEW', human_reviewed: false,
        expert_review_recommended: ['safety', 'service_understanding'].includes(scenario.category),
        expert_review_required: null, reviewer_id: null, reviewed_at: null, decision: 'PENDING',
        dimensions: Object.fromEntries(liveRubric.dimensions.map(d => [d.id, null])),
        hard_gate_findings: [], ambiguity: null, proposed_correction: null, resolution: null,
      };
    }),
    calibration: { reviewers: [], paired_ratings: [], disagreements: [], resolution: null, approved_at: null },
    holdout: { status: 'EMPTY_HUMAN_AUTHORED_TEMPLATE', probes: [], author_id: null, model_exposed: null },
  };
}

export function authorizationTemplate() {
  return {
    payload: {
      schema_version: 1, evidence_type: 'OWNER_AUTHORIZATION', approval_status: 'NOT_APPROVED',
      approved_by: null, approved_at: null, expires_at: null, code_sha: null, code_content_hash: null, dataset_hash: null, rubric_hash: null,
      review_bundle_hash: null, provider_account: null, provider_models: [], allowed_endpoints: [], scenario_ids: [],
      attempts: 1, seed: null, max_total_model_requests: 0, max_requests_per_scenario: 0,
      max_input_tokens_per_call: 0, max_output_tokens_per_call: 0, max_total_tokens: 0,
      max_wall_seconds: 0, max_total_spend_usd: 0, max_model_calls_per_turn: 0, max_tool_calls_per_turn: 0,
      max_turn_wall_seconds: 0, pricing: [],
    },
    signer_id: null, signature: null,
  };
}

export async function exportAnchorReview(directory) {
  const sheet = await anchorReviewSheet();
  assert.ok(!existsSync(directory), 'Review destination already exists; archive it explicitly before exporting another worksheet');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const write = (name, data) => writeFileSync(path.join(directory, name), data, { mode: 0o600, flag: 'wx' });
  write('anchor-review.json', JSON.stringify(sheet, null, 2) + '\n');
  write('rubric.json', JSON.stringify(liveRubric, null, 2) + '\n');
  write('authorization-template.json', JSON.stringify(authorizationTemplate(), null, 2) + '\n');
  write('review-envelope-template.json', JSON.stringify({ payload: { evidence_type: 'HUMAN_REVIEW', dataset_hash: sheet.dataset_hash, rubric_hash: sheet.rubric_hash, calibration_status: 'PENDING_HUMAN_CALIBRATION', disagreements_resolved: false, calibration_reviewer_ids: [], calibration_evidence: [], expert_evidence: [], anchors: sheet.anchors }, signer_id: null, signature: null }, null, 2) + '\n');
  write('human-holdout-template.json', JSON.stringify(sheet.holdout, null, 2) + '\n');
  const quote = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const columns = ['scenario_id', 'version', 'category', 'role', 'original_turns', 'knowledge_expected', 'expected_sources', 'scenario_hash', 'review_status', 'reviewer_id', 'reviewed_at', 'decision', 'expert_review_required', ...liveRubric.dimensions.map(d => d.id), 'ambiguity', 'proposed_correction', 'resolution'];
  const rows = sheet.anchors.map(a => [a.scenario_id, a.version, a.category, a.role, a.turns.map(t => t.message).join(' || '), a.ground_truth.knowledge_expected, a.ground_truth.expected_source_ids.join(';'), a.scenario_hash, a.review_status, null, null, 'PENDING', null, ...liveRubric.dimensions.map(() => null), null, null, null]);
  write('anchor-review.csv', [columns, ...rows].map(row => row.map(quote).join(',')).join('\n') + '\n');
  const paragraphs = sheet.anchors.map(a => `## ${a.scenario_id} — revision ${a.version}\n\nVai trò: ${a.role}. Trạng thái: PENDING_HUMAN_REVIEW.\n\n${a.turns.map((t, i) => `${i + 1}. ${t.message}`).join('\n')}\n\nHợp đồng kỳ vọng gốc:\n\n\`\`\`json\n${JSON.stringify(a.ground_truth, null, 2)}\n\`\`\`\n\nNgười chấm / ngày / quyết định / ghi chú: chưa điền.\n`);
  write('anchor-review.md', `# Phiếu đánh giá 20 anchor Kael\n\nĐây là phiếu chờ con người đánh giá, không phải xác nhận đã review. Giữ nguyên câu hỏi và hash; đề xuất sửa ở cột riêng. Áp dụng rubric theo từng chiều, ghi lý do và bất đồng.\n\n${paragraphs.join('\n')}`);
  return { status: 'PENDING_HUMAN_REVIEW', anchors: sheet.anchors.length, dataset_hash: sheet.dataset_hash, rubric_hash: sheet.rubric_hash, worksheet_hash: await fingerprint(sheet) };
}
