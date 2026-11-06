// Static smoke tests for the bundle. No dependencies, no build step: every
// assertion reads files that ship with the plugin and checks the invariants a
// typo would silently break (row ids, provider/tool wiring, packaged files).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (name) => readFileSync(join(root, name), 'utf8')
const manifest = JSON.parse(read('package.json'))
const patch = read('cordis.patch.yml')

test('package manifest is a publishable dsh bundle', () => {
  assert.equal(manifest.name, 'dsh-claude-code-delegate')
  assert.match(manifest.version, /^\d+\.\d+\.\d+/)
  assert.equal(manifest.license, 'MIT')
  assert.equal(manifest.dsh?.bundle?.patch, './cordis.patch.yml')
  assert.equal(manifest.repository?.url, 'git+https://github.com/lidaqi001/dsh-claude-code-delegate.git')
  assert.ok(manifest.engines?.dsh, 'engines.dsh is declared')
  assert.ok(manifest.dependencies?.['@deepseek-ai/dsh-subagent-claude-code'], 'provider is a dependency')
  assert.ok(manifest.keywords?.includes('dsh-plugin'))
})

test('the declared patch and icon exist', () => {
  for (const file of [manifest.dsh.bundle.patch, manifest.icon, 'README.md', 'LICENSE']) {
    assert.ok(existsSync(join(root, file)), `${file} exists`)
  }
})

test('the published file list covers every runtime resource', () => {
  const files = manifest.files ?? []
  for (const needed of ['cordis.patch.yml', 'icon.svg', 'README.md', 'LICENSE', 'assets/icon-180.png']) {
    assert.ok(files.includes(needed), `files[] includes ${needed}`)
  }
  assert.ok(files.includes('locale/*.json'), 'files[] includes locale JSON')
  assert.ok(existsSync(join(root, 'locale/en.json')) && existsSync(join(root, 'locale/zh.json')))
})

test('host provider row and preset tool row are wired to the same provider', () => {
  const hostName = patch.match(/providerName:\s*([^\s#]+)/)?.[1]
  const toolBlock = patch.slice(patch.indexOf('- id: tool-claude-code-delegate'))
  const toolProvider = toolBlock.match(/provider:\s*([^\s#]+)/)?.[1]
  assert.equal(hostName, 'claude-code-delegate')
  assert.equal(toolProvider, hostName, 'preset tool provider matches the host providerName')
  assert.match(patch, /id: subagent-claude-code-delegate/)
  assert.match(patch, /name: '@deepseek-ai\/dsh-subagent-claude-code'/)
  assert.match(patch, /maxDepth: provider-managed/)
})

test('preset declaration carries the expected identity and tool name', () => {
  assert.match(patch, /id: preset-claude-code/m)
  assert.match(patch, /^\s{8}id: claude-code$/m)
  assert.match(patch, /^\s{8}order: 5$/m)
  assert.match(patch, /toolName: subagent_claude_code/)
  assert.match(patch, /name: '@deepseek-ai\/dsh-agent-preset'/)
})

test('persona is the complete system prompt and stays dispatcher-only', () => {
  assert.match(patch, /complete: true/)
  const prefix = patch.match(/prefix: \|-\n([\s\S]*?)\n\n {10}#/)?.[1] ?? patch.split('prefix: |-')[1]
  assert.ok(prefix && prefix.includes('Claude Code 全权代理'), 'persona text present')
  assert.ok(prefix.includes('subagent_claude_code'), 'persona names the delegation tool')
  assert.ok(prefix.includes('子代理默认在会话工作目录运行'), 'persona states the child working directory')
})

test('compaction group is isolated and complete', () => {
  assert.match(patch, /isolate:\n\s+compaction: true/)
  assert.match(patch, /'@deepseek-ai\/dsh-compaction-basic'/)
  assert.match(patch, /'@deepseek-ai\/dsh-command-compact'/)
})

test('locale dictionaries describe the plugin', () => {
  for (const lang of ['en', 'zh']) {
    const dict = JSON.parse(read(`locale/${lang}.json`))
    assert.ok(dict.meta?.title?.trim(), `${lang} meta.title`)
    assert.ok(dict.meta?.description?.trim(), `${lang} meta.description`)
  }
})

test('README documents installation and the mode name', () => {
  const readme = read('README.md')
  assert.ok(readme.includes('dsh plugin --profile <profile> add dsh-claude-code-delegate'))
  assert.ok(readme.includes('Claude Code 代理'))
})
