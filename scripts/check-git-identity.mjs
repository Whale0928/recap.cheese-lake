import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const name = 'Whale0928';
const email = 'rlagusrl928@gmail.com';
const fingerprint = '08A84E718115A7F90C8508AFB1C60F25CF3EE0F3';

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function config(key) {
  try {
    return git('config', '--get', key);
  } catch (error) {
    if (error.status === 1) return '';
    throw error;
  }
}

function assertIdentity(actualName, actualEmail, label) {
  if (actualName !== name || actualEmail !== email) {
    throw new Error(`${label}: ${name} <${email}> 계정만 사용할 수 있습니다.`);
  }
}

function checkCommitSettings() {
  for (const role of ['AUTHOR', 'COMMITTER']) {
    const ident = git('var', `GIT_${role}_IDENT`).match(/^(.*) <([^<>]+)> \d+ [+-]\d{4}$/);
    if (!ident) throw new Error(`${role} 정보를 확인할 수 없습니다.`);
    assertIdentity(ident[1], ident[2], role);
  }
  if (git('config', '--type=bool', '--get', 'commit.gpgsign') !== 'true') {
    throw new Error('commit.gpgsign을 true로 설정해야 합니다.');
  }
  if (config('gpg.format') && config('gpg.format') !== 'openpgp') {
    throw new Error('OpenPGP 서명만 사용할 수 있습니다.');
  }
  if (config('user.signingkey').toUpperCase().replace(/!$/, '') !== fingerprint) {
    throw new Error(`user.signingkey를 ${fingerprint}로 설정해야 합니다.`);
  }
  console.log('Git 계정과 서명 설정 확인 완료');
}

function checkHistory(tips) {
  if (tips.length === 0) return;
  // 모든 조상을 검사해 다른 브랜치에서 유입된 잘못된 계정도 차단한다.
  const records = git('log', '--format=%H%x00%an%x00%ae%x00%cn%x00%ce%x00%G?%x00%GP', ...tips, '--').split('\n');
  for (const record of records) {
    const [sha, authorName, authorEmail, committerName, committerEmail, signature, primaryKey] = record.split('\0');
    const label = sha.slice(0, 12);
    assertIdentity(authorName, authorEmail, `${label} 작성자`);
    assertIdentity(committerName, committerEmail, `${label} 커미터`);
    if (signature !== 'G' || primaryKey !== fingerprint) {
      throw new Error(`${label}: 지정된 GPG 키의 유효한 서명이 필요합니다.`);
    }
  }
  console.log(`Git 계정과 GPG 서명 확인 완료: ${records.length}개 커밋`);
}

function pushTips() {
  const input = readFileSync(0, 'utf8').trim();
  if (!input) return [];
  const tips = new Set();
  for (const line of input.split('\n')) {
    const fields = line.trim().split(/\s+/);
    if (fields.length !== 4 || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(fields[1])) {
      throw new Error('pre-push 입력 형식이 올바르지 않습니다.');
    }
    if (/^0+$/.test(fields[1])) continue;
    tips.add(git('rev-parse', '--verify', `${fields[1]}^{commit}`));
  }
  return [...tips];
}

try {
  switch (process.argv[2]) {
    case 'pre-commit': checkCommitSettings(); break;
    case 'pre-push': checkHistory(pushTips()); break;
    case 'history': checkHistory(['HEAD']); break;
    default: throw new Error('사용법: node scripts/check-git-identity.mjs pre-commit|pre-push|history');
  }
} catch (error) {
  console.error(`Git 계정·서명 검사 실패: ${error.message}`);
  process.exitCode = 1;
}
