import { existsSync, mkdirSync, mkdtempSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

function inside(root, target) {
  const rel = relative(root, target);
  return rel !== '' && !isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + sep);
}

// 僅供明確要求隔離 worktree 的 gate；先驗證每層實際路徑，不跟隨外部連結。
export function createWorkspaceBrowserProfile(workspace) {
  const root = realpathSync(workspace);
  let parent = root;
  for (const name of ['review', 'browser-profiles']) {
    const candidate = resolve(parent, name);
    if (!existsSync(candidate)) mkdirSync(candidate, { recursive: false });
    parent = realpathSync(candidate);
    if (!inside(root, parent)) throw new Error('瀏覽器暫存目錄超出 worktree');
  }
  const profile = mkdtempSync(resolve(parent, 'esmo-cdp-'));
  if (!inside(root, realpathSync(profile))) throw new Error('瀏覽器 profile 超出 worktree');
  return profile;
}
