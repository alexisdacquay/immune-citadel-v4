export const meta = {
  name: 'issue-cycle',
  description: 'Immune Citadel: an ic-engineer builds one GitHub issue on its branch, an ic-qa verifies it; up to two fix rounds',
  whenToUse: 'From the continue skill, once the orchestrator has written the Spec comment on an issue. args: { issue: <number>, slug: "<short-slug>", repo: "<absolute repo path>" }',
  phases: [{ title: 'Build', model: 'opus' }, { title: 'Verify', model: 'opus' }, { title: 'Fix', model: 'opus' }],
}
// The role files in .claude/agents are the single source of truth: when this repo is the session's working directory they are
// registered as agent types (ic-engineer, ic-qa); otherwise (args.roleFiles = true) each agent reads its role file first.
const repo = (args && args.repo) || '/Users/ad/code/immune-citadel-v4', n = args && args.issue, slug = (args && args.slug) || 'work'
if (!n) throw new Error('issue-cycle needs args.issue')
const branch = `issue/${n}-${slug}`
const as = role => args && args.roleFiles
  ? { model: 'opus', effort: 'high', pre: `Your role is defined in ${repo}/.claude/agents/${role}.md: read it first and follow it exactly.\n` }
  : { model: 'opus', effort: 'high', agentType: role, pre: '' }
const VERDICT = { type: 'object', properties: {
  pass: { type: 'boolean' }, criteria: { type: 'array', items: { type: 'object', properties: { criterion: { type: 'string' }, pass: { type: 'boolean' }, evidence: { type: 'string' } }, required: ['criterion', 'pass', 'evidence'] } },
  regressions: { type: 'array', items: { type: 'string' } }, comment: { type: 'string', description: 'URL of the QA verdict comment' } }, required: ['pass', 'criteria', 'regressions'] }
const REPORT = { type: 'object', properties: { summary: { type: 'string' }, checks: { type: 'array', items: { type: 'string' } }, unverified: { type: 'array', items: { type: 'string' } }, commit: { type: 'string' }, comment: { type: 'string' } }, required: ['summary', 'checks', 'unverified'] }
const engineer = (round, qa) => { const o = as('ic-engineer'); return agent(`${o.pre}Repository: ${repo}. Issue #${n}, branch ${branch}.${round ? `\nRound ${round + 1}: QA failed it. Fix every failed criterion and regression:\n${JSON.stringify(qa, null, 1)}` : ''}\nImplement the issue as its latest Spec comment says, run the checks, post your Engineer report on the issue, and return it.`,
  { label: `engineer #${n}${round ? ' r' + (round + 1) : ''}`, phase: round ? 'Fix' : 'Build', schema: REPORT, model: o.model, effort: o.effort, agentType: o.agentType }) }
const qa = round => { const o = as('ic-qa'); return agent(`${o.pre}Repository: ${repo}. Issue #${n}, branch ${branch}${round ? ` (round ${round + 1})` : ''}.\nVerify it against its Spec comment and the regression suites, post your QA verdict on the issue, and return it.`,
  { label: `qa #${n}${round ? ' r' + (round + 1) : ''}`, phase: 'Verify', schema: VERDICT, model: o.model, effort: o.effort, agentType: o.agentType }) }
const rounds = []
let report = await engineer(0), verdict = null
for (let r = 0; r < 3; r++) {
  if (!report) { log(`engineer returned nothing in round ${r + 1}: stopping`); break }
  verdict = await qa(r); rounds.push({ report, verdict })
  if (!verdict) { log(`QA returned nothing in round ${r + 1}: stopping`); break }
  log(`round ${r + 1}: QA ${verdict.pass ? 'PASS' : 'FAIL'} (${verdict.criteria.filter(c => c.pass).length}/${verdict.criteria.length} criteria)`)
  if (verdict.pass || r === 2) break
  report = await engineer(r + 1, { failed: verdict.criteria.filter(c => !c.pass), regressions: verdict.regressions })
}
return { issue: n, branch, pass: !!(verdict && verdict.pass), rounds: rounds.length, last: rounds[rounds.length - 1] || null }
