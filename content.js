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
    btn.textContent = '✨ Generate MR Description';
    btn.addEventListener('click', () => onGenerate(btn, info));

    // Wait for the form/page to be ready, then place button
    const observer = new MutationObserver(() => {
      if (document.getElementById('mr-desc-gen-btn')) return;
      const target = findInsertTarget(info);
      if (target) {
        target.parentElement.insertBefore(btn, target.nextSibling);
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Also try immediately
    const target = findInsertTarget(info);
    if (target) {
      target.parentElement.insertBefore(btn, target.nextSibling);
      observer.disconnect();
    }
  }

  function findInsertTarget(info) {
    if (info.isNew) {
      // New MR: place near the description field
      return document.querySelector('.js-vue-markdown-field, .md-area, #merge_request_description')?.closest('.form-group') ||
             document.querySelector('#merge_request_description');
    }
    // Existing MR: place near the title or header area
    return document.querySelector('.detail-page-header, .merge-request-details .mr-title');
  }

  async function onGenerate(btn, info) {
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

      const result = await chrome.runtime.sendMessage({ action: 'generate', ...info });

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

  function fillDescription(info, { title, body }) {
    if (info.isNew) {
      // New MR form
      const titleInput = document.querySelector('#merge_request_title');
      if (titleInput && title) setNativeValue(titleInput, title);

      const descInput = document.querySelector('#merge_request_description');
      if (descInput) setNativeValue(descInput, body);

      // Trigger Vue/React reactivity
      triggerInput(titleInput);
      triggerInput(descInput);
    } else {
      // Existing MR — try edit mode, fallback to clipboard
      const descInput = document.querySelector('#merge_request_description, textarea[name="merge_request[description]"]');
      if (descInput) {
        setNativeValue(descInput, body);
        triggerInput(descInput);
      } else {
        // Not in edit mode — copy to clipboard
        navigator.clipboard.writeText(`${title ? 'Title: ' + title + '\n\n' : ''}${body}`);
        alert('MR description copied to clipboard! (Open edit mode to paste)');
      }
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
