/* content.js — detect GitLab MR pages, inject button, fill description */

(function () {
  if (document.getElementById('mr-desc-gen-btn')) return;

  const info = parsePage();
  if (!info) return;

  injectButton(info);

  function parsePage() {
    const url = location.href;
    const path = location.pathname;

    // GitLab: new MR — /-/merge_requests/new
    const newMR = path.match(/^\/(.+?)\/-\/merge_requests\/new/);
    if (newMR) {
      return {
        platform: 'gitlab',
        domain: location.hostname,
        projectPath: newMR[1],
        isNew: true,
        iid: null
      };
    }

    // GitLab: existing MR — /-/merge_requests/:iid (not /edit, /diffs, etc at root)
    const existMR = path.match(/^\/(.+?)\/-\/merge_requests\/(\d+)(\/|$)/);
    if (existMR) {
      return {
        platform: 'gitlab',
        domain: location.hostname,
        projectPath: existMR[1],
        isNew: false,
        iid: existMR[2]
      };
    }

    return null;
  }

  function injectButton(info) {
    const btn = document.createElement('button');
    btn.id = 'mr-desc-gen-btn';
    btn.type = 'button'; // avoid submitting the GitLab form we live inside
    btn.textContent = '✨ Generate MR Description';
    btn.addEventListener('click', () => onGenerate(btn, info));

    // Wait for the form/page to be ready, then place button
    const observer = new MutationObserver(() => {
      if (document.getElementById('mr-desc-gen-btn')) return;
      const target = findInsertTarget();
      if (target) {
        target.parentElement.insertBefore(btn, target.nextSibling);
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Also try immediately
    const target = findInsertTarget();
    if (target) {
      target.parentElement.insertBefore(btn, target.nextSibling);
      observer.disconnect();
    }
  }

  function findInsertTarget() {
    // New or Edit MR: anchor near the description field (same DOM on both)
    const descField = document.querySelector('.js-vue-markdown-field, .md-area, #merge_request_description');
    if (descField) return descField.closest('.form-group') || descField;
    // Existing MR detail page (view-only): anchor at the header
    return document.querySelector('.detail-page-header, .merge-request-details .mr-title');
  }

  async function onGenerate(btn, info) {
    const extras = await openContextModal();
    if (!extras) return; // user cancelled

    btn.disabled = true;
    btn.textContent = '⏳ Generating...';

    try {
      // For new MR, read branches from the form
      if (info.isNew) {
        info.sourceBranch = getSelectValue('#merge_request_source_branch') ||
                            new URLSearchParams(location.search).get('merge_request[source_branch]') || '';
        info.targetBranch = getSelectValue('#merge_request_target_branch') ||
                            new URLSearchParams(location.search).get('merge_request[target_branch]') || '';
        if (!info.sourceBranch) throw new Error('Cannot detect source branch');
      }

      const result = await chrome.runtime.sendMessage({ action: 'generate', ...info, ...extras });

      if (result.error) throw new Error(result.error);

      fillDescription(info, result);
      btn.textContent = '✅ Done!';
    } catch (err) {
      btn.textContent = '❌ Error';
      alert('MR Desc Generator: ' + err.message);
    } finally {
      setTimeout(() => {
        btn.disabled = false;
        btn.textContent = '✨ Generate MR Description';
      }, 2000);
    }
  }

  function openContextModal() {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.id = 'mr-desc-gen-modal';
      overlay.innerHTML = `
        <div class="mr-desc-gen-dialog" role="dialog" aria-modal="true" aria-labelledby="mr-desc-gen-title">
          <h2 id="mr-desc-gen-title">Add Context (optional)</h2>
          <p class="mr-desc-gen-hint">All fields are optional. Fill what helps the AI understand your MR.</p>
          <form id="mr-desc-gen-form">
            <label>Additional Context
              <textarea name="additionalContext" placeholder="e.g. Part of auth refactor epic. Migrating from sessions to JWT."></textarea>
            </label>
            <label>JIRA Links <span class="mr-desc-gen-hint">(one URL per line)</span>
              <textarea name="jiraLinks" placeholder="https://jira.example.com/browse/PROJ-123"></textarea>
            </label>
            <label>Figma Links <span class="mr-desc-gen-hint">(one URL per line)</span>
              <textarea name="figmaLinks" placeholder="https://figma.com/..."></textarea>
            </label>
            <label>PRD Links <span class="mr-desc-gen-hint">(one URL per line)</span>
              <textarea name="prdLinks" placeholder="https://docs.example.com/..."></textarea>
            </label>
            <div class="mr-desc-gen-actions">
              <button type="button" class="mr-desc-gen-cancel">Cancel</button>
              <button type="submit" class="mr-desc-gen-submit">Generate</button>
            </div>
          </form>
        </div>
      `;
      document.body.appendChild(overlay);

      const form = overlay.querySelector('#mr-desc-gen-form');
      const close = (value) => {
        overlay.remove();
        resolve(value);
      };

      overlay.querySelector('.mr-desc-gen-cancel').addEventListener('click', () => close(null));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const lines = (name) => (fd.get(name) || '')
          .split('\n').map((s) => s.trim()).filter(Boolean);
        close({
          additionalContext: (fd.get('additionalContext') || '').trim(),
          jiraLinks: lines('jiraLinks'),
          figmaLinks: lines('figmaLinks'),
          prdLinks: lines('prdLinks')
        });
      });

      overlay.querySelector('textarea')?.focus();
    });
  }

  function fillDescription(_info, { title, body }) {
    const titleInput = document.querySelector('#merge_request_title');
    const descInput = document.querySelector('#merge_request_description, textarea[name="merge_request[description]"]');

    if (descInput) {
      if (titleInput && title) {
        setNativeValue(titleInput, title);
        triggerInput(titleInput);
      }
      setNativeValue(descInput, body);
      triggerInput(descInput);
    } else {
      // View-only MR page — copy to clipboard
      navigator.clipboard.writeText(`${title ? 'Title: ' + title + '\n\n' : ''}${body}`);
      alert('MR description copied to clipboard! (Open edit mode to paste)');
    }
  }

  function setNativeValue(el, value) {
    const proto = Object.getOwnPropertyDescriptor(
      el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
      'value'
    );
    if (proto && proto.set) {
      proto.set.call(el, value);
    } else {
      el.value = value;
    }
  }

  function triggerInput(el) {
    if (!el) return;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function getSelectValue(selector) {
    const el = document.querySelector(selector);
    if (!el) return '';
    return el.value || el.dataset?.value || '';
  }
})();
