import dotenv from 'dotenv';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfig } from '../src/config';
import { FlowKind } from '../src/types';
import { FLOW_PROJECTS, listFlowProjects } from '../src/catalog/flow-metadata';

dotenv.config();

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

function indentBlock(content: string, spaces: number): string {
  const prefix = ' '.repeat(spaces);
  return content
    .replace(/\r\n/g, '\n')
    .trimEnd()
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n');
}

function configuredFlowName(kind: FlowKind): string {
  const config = getConfig();

  switch (kind) {
    case 'mr':
      return config.mrFlowName;
    case 'issue':
      return config.issueFlowName;
    case 'release':
      return config.releaseFlowName;
    default:
      return FLOW_PROJECTS[kind].defaultName;
  }
}

async function renderFlowProject(kind: FlowKind): Promise<string> {
  const root = repoRoot();
  const metadata = FLOW_PROJECTS[kind];
  const definitionPath = path.join(root, metadata.definitionPath);
  const targetPath = path.join(root, 'gitlab-template-projects', metadata.slug, 'flows', 'flow.yml');
  const definition = await readFile(definitionPath, 'utf8');

  const wrapper = [
    `name: ${JSON.stringify(configuredFlowName(kind))}`,
    `description: ${JSON.stringify(metadata.description)}`,
    'public: true',
    'definition:',
    indentBlock(definition, 2),
    ''
  ].join('\n');

  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, wrapper, 'utf8');
  return targetPath;
}

async function main(): Promise<void> {
  const outputs = await Promise.all(listFlowProjects().map((project) => renderFlowProject(project.kind)));

  for (const output of outputs) {
    console.log(`rendered ${path.relative(repoRoot(), output)}`);
  }
}

main().catch((error) => {
  console.error('[render-flow-projects] failed', error);
  process.exitCode = 1;
});
