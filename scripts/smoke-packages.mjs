import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const workspace = await mkdtemp(path.join(tmpdir(), 'avatar-runtime-pack-smoke-'))
const consumer = path.join(workspace, 'consumer')

const run = (args, cwd = root, capture = false) => {
  const result = spawnSync('pnpm', args, {
    cwd,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  })
  if (result.status !== 0) process.exit(result.status ?? 1)
  return result.stdout?.trim()
}

run(['packages:build'])
const pack = packageName => {
  const output = run(
    ['--dir', path.join(root, 'packages', packageName), 'pack', '--pack-destination', workspace],
    root,
    true
  )
  return output.split('\n').at(-1)
}
const coreTarball = pack('avatar-core')
const reactTarball = pack('avatar-react')

await cp(path.join(root, 'examples/react-vite-consumer'), consumer, {
  recursive: true,
  filter: source =>
    !source.includes(`${path.sep}node_modules`) && !source.includes(`${path.sep}dist`),
})
const packagePath = path.join(consumer, 'package.json')
const packageJson = JSON.parse(await readFile(packagePath, 'utf8'))
packageJson.dependencies['@bible-strong/avatar-core'] = `file:${coreTarball}`
packageJson.dependencies['@bible-strong/avatar-react'] = `file:${reactTarball}`
packageJson.pnpm = { overrides: { '@bible-strong/avatar-core': `file:${coreTarball}` } }
await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`)

run(['install', '--no-frozen-lockfile'], consumer)
run(['build'], consumer)
process.stdout.write(`Tarball consumer verified at ${consumer}\n`)
