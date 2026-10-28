import { spawnSync } from 'node:child_process';
import { git } from './repository-files.mjs';

const verdictNames = new Set(['PASS', 'FAIL', 'INSUFFICIENT_EVIDENCE']);
const goodSignature = /^Good "git" signature for (\S+) with \S+ key (SHA256:\S+)$/m;
const evidenceReference = /^(.+?):(\d+)(?:-(\d+))?(?:\s.*)?$/;

const refused = reasons => ({ attested: false, reasons, signer: null, key: null, codeHealth: null });

function lineCount(text) {
  return text.replace(/\n$/, '').split('\n').length;
}

export function verifyAttestation(repository, tag, { headSha, mergeBase, view }) {
  if (tag === null || tag === undefined) return refused(['No signed reviewer attestation was supplied, so structural quality has no verifiable independent verdict.']);
  if (typeof tag !== 'string' || !tag) return refused(['The reviewer attestation must name a signed git tag; a self-declared verdict is not evidence.']);
  const reference = `refs/tags/${tag}`;
  let kind;
  let peeled;
  try {
    kind = git(repository, ['cat-file', '-t', reference]).trim();
    peeled = git(repository, ['rev-parse', '--verify', `${reference}^{commit}`]).trim();
  } catch {
    return refused([`Reviewer attestation tag ${tag} does not exist.`]);
  }
  if (kind !== 'tag') return refused([`Reviewer attestation ${tag} is not an annotated, signed tag.`]);
  if (peeled !== headSha) return refused([`Reviewer attestation ${tag} covers ${peeled.slice(0, 12)}, not the frozen head ${headSha.slice(0, 12)}.`]);

  const checked = spawnSync('git', ['verify-tag', reference], { cwd: repository, encoding: 'utf8' });
  const signature = goodSignature.exec(`${checked.stdout}${checked.stderr}`);
  if (checked.status !== 0 || !signature) {
    const reason = `${checked.stderr}${checked.stdout}`.split('\n').find(line => line.trim())?.trim() ?? 'no output';
    return refused([`The signature of ${tag} was not verified against the allowed signers of this verifier: ${reason}`]);
  }
  const [, signer, key] = signature;

  const involved = git(repository, ['log', '--format=%ae%n%ce%n%GK', `${mergeBase}..${headSha}`]).split(/\r?\n/).map(line => line.trim().toLowerCase()).filter(Boolean);
  if (involved.includes(signer.toLowerCase()) || involved.includes(key.toLowerCase())) {
    return refused([`Reviewer attestation ${tag} is signed by ${signer} (${key}), which authored, committed or signed the reviewed commits.`]);
  }

  let payload;
  try {
    payload = JSON.parse(git(repository, ['for-each-ref', '--format=%(contents:subject)%0a%(contents:body)', reference]));
  } catch {
    return refused([`The message of ${tag} is not a JSON verdict.`]);
  }
  const verdict = payload?.codeHealth?.verdict;
  if (!verdictNames.has(verdict)) return refused([`The verdict signed in ${tag} must be PASS, FAIL or INSUFFICIENT_EVIDENCE.`]);
  const evidence = Array.isArray(payload.codeHealth.evidence) ? payload.codeHealth.evidence.map(String) : [];
  const unresolved = evidence.filter(item => {
    const match = evidenceReference.exec(item);
    if (!match || !view.has(match[1])) return true;
    const first = Number(match[2]);
    const last = Number(match[3] ?? match[2]);
    return first < 1 || last < first || last > lineCount(view.read(match[1]));
  });
  return { attested: true, reasons: [], signer, key, codeHealth: { verdict, evidence, unresolved } };
}
