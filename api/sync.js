'use strict';

/*
 * Commits the checklist back to the repository so that a change made in
 * the deployed app lands on GitHub, which makes the host redeploy it.
 *
 * Needs one environment variable on the host:
 *   GITHUB_TOKEN  fine-grained PAT, "Contents: read and write" on this repo
 * Optional:
 *   GITHUB_REPO   owner/repo, defaults to the repo this app lives in
 *   GITHUB_PATH   file to write, defaults to data/checklist.json
 *   GITHUB_BRANCH branch to commit on, defaults to main
 *
 * Without GITHUB_TOKEN it answers 501 and the app stays local-only.
 */

const DEFAULT_REPO = 'RJN-github/orion-checklist';
const DEFAULT_PATH = 'data/checklist.json';
const DEFAULT_BRANCH = 'main';

function isValidChecklist(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  if (!Array.isArray(data.lists) || data.lists.length === 0) return false;
  return data.lists.every(
    (list) => list && typeof list.name === 'string' && Array.isArray(list.categories)
  );
}

/* updatedAt is regenerated on every write, so compare without it. */
function comparable(data) {
  return JSON.stringify({ version: 1, lists: data.lists });
}

function sameChecklist(existingText, incoming) {
  try {
    return comparable(JSON.parse(existingText)) === comparable(incoming);
  } catch (error) {
    return false;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');

  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO || DEFAULT_REPO;
  const filePath = process.env.GITHUB_PATH || DEFAULT_PATH;
  const branch = process.env.GITHUB_BRANCH || DEFAULT_BRANCH;

  if (req.method === 'GET') {
    res.status(200).json({ configured: Boolean(token) });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }

  if (!token) {
    res.status(501).json({ error: 'sync is not configured on this deployment' });
    return;
  }

  const origin = req.headers.origin;
  const host = req.headers.host;
  if (origin && host && origin.indexOf(host) === -1) {
    res.status(403).json({ error: 'wrong origin' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (error) {
      body = null;
    }
  }

  if (!isValidChecklist(body)) {
    res.status(400).json({ error: 'not a valid checklist' });
    return;
  }

  const content =
    JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), lists: body.lists }, null, 2) +
    '\n';

  const apiUrl = 'https://api.github.com/repos/' + repo + '/contents/' + filePath;
  const headers = {
    authorization: 'Bearer ' + token,
    accept: 'application/vnd.github+json',
    'user-agent': 'orion-checklist-sync',
    'x-github-api-version': '2022-11-28',
  };

  try {
    let sha = null;
    let existing = '';
    const current = await fetch(apiUrl + '?ref=' + encodeURIComponent(branch), { headers });

    if (current.ok) {
      const info = await current.json();
      sha = info.sha;
      existing = Buffer.from(info.content || '', 'base64').toString('utf8');
    } else if (current.status !== 404) {
      res.status(502).json({ error: 'could not read the file on GitHub', status: current.status });
      return;
    }

    if (existing && sameChecklist(existing, body)) {
      res.status(200).json({ ok: true, skipped: true });
      return;
    }

    const payload = {
      message: 'Update checklist from the app',
      content: Buffer.from(content, 'utf8').toString('base64'),
      branch: branch,
    };
    if (sha) payload.sha = sha;

    const commit = await fetch(apiUrl, {
      method: 'PUT',
      headers: Object.assign({ 'content-type': 'application/json' }, headers),
      body: JSON.stringify(payload),
    });

    if (!commit.ok) {
      const detail = await commit.text();
      res.status(502).json({
        error: 'could not commit to GitHub',
        status: commit.status,
        detail: detail.slice(0, 300),
      });
      return;
    }

    const result = await commit.json();
    res.status(200).json({ ok: true, commit: result.commit && result.commit.sha });
  } catch (error) {
    res.status(500).json({ error: 'sync failed', detail: String(error).slice(0, 200) });
  }
};
