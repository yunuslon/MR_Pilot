/* background.js — service worker: GitLab API + AI API */

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'generate') {
    handleGenerate(msg).then((result) => sendResponse(result)).catch((err) => sendResponse({ error: err.message }));
    return true; // async response
  }
});

async function handleGenerate({ platform, domain, projectPath, iid, sourceBranch, targetBranch, isNew }) {
  const cfg = await chrome.storage.sync.get(['aiBaseUrl', 'aiApiKey', 'aiModel', 'gitlabToken', 'language']);
  if (!cfg.gitlabToken) throw new Error('GitLab token not configured. Open extension settings.');
  if (!cfg.aiApiKey) throw new Error('AI API key not configured. Open extension settings.');

  const diff = await fetchDiff({ domain, projectPath, iid, sourceBranch, targetBranch, isNew, token: cfg.gitlabToken });
  const result = await callAI(diff, cfg);
  return result;
}

/* ---- GitLab API ---- */

async function fetchDiff({ domain, projectPath, iid, sourceBranch, targetBranch, isNew, token }) {
  const base = `https://${domain}/api/v4`;
  const pid = encodeURIComponent(projectPath);
  let url;

  if (isNew) {
    // New MR — compare branches
    url = `${base}/projects/${pid}/repository/compare?from=${encodeURIComponent(targetBranch)}&to=${encodeURIComponent(sourceBranch)}&straight=false`;
  } else {
    // Existing MR — get changes
    url = `${base}/projects/${pid}/merge_requests/${iid}/changes`;
  }

  const res = await fetch(url, { headers: { 'PRIVATE-TOKEN': token } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitLab API ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const changes = isNew ? data.diffs : data.changes;
  if (!changes || changes.length === 0) throw new Error('No changes found in this MR.');

  // Format diff — truncate to ~12k chars to stay within token limits
  let diffText = '';
  for (const c of changes) {
    const header = `--- ${c.old_path}\n+++ ${c.new_path}\n`;
    diffText += header + (c.diff || '') + '\n';
    if (diffText.length > 12000) {
      diffText += '\n... (truncated, too many changes)\n';
      break;
    }
  }
  return diffText;
}

/* ---- AI API ---- */

async function callAI(diff, cfg) {
  const baseUrl = (cfg.aiBaseUrl || 'http://localhost:20128/v1').replace(/\/+$/, '');
  const model = cfg.aiModel || 'gpt-4o';
  const lang = cfg.language === 'id' ? 'Bahasa Indonesia' : 'English';

  const systemPrompt = `You are an expert code reviewer. Given a git diff from a GitLab Merge Request, generate a clear MR description in ${lang}.

Output EXACTLY this format (keep the headers as-is):

Title: <a concise MR title, imperative mood, max 72 chars>

## What was changed
<bullet list of changes>

## Why the change was made
<explain the motivation/context>

## How the change works
<technical explanation of the approach>

## How to test
<numbered steps to verify the change>

Rules:
- Be concise but thorough
- Infer "why" from the code context if not obvious
- For "how to test", give practical steps a reviewer can follow
- Do NOT wrap the output in a code block`;

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cfg.aiApiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Here is the diff:\n\n${diff}` }
      ],
      temperature: 0.3,
      stream: false  
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AI API ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('AI returned empty response');

  // Parse title and body
  const titleMatch = content.match(/^Title:\s*(.+)/m);
  const title = titleMatch ? titleMatch[1].trim() : '';
  const body = content.replace(/^Title:\s*.+\n*/m, '').trim();

  return { title, body };
}
