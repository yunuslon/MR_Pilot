const FIELDS = ['aiBaseUrl', 'aiApiKey', 'aiModel', 'gitlabToken', 'language'];

document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.sync.get(FIELDS, (data) => {
    FIELDS.forEach((f) => {
      if (data[f]) document.getElementById(f).value = data[f];
    });
  });
});

document.getElementById('settings').addEventListener('submit', (e) => {
  e.preventDefault();
  const data = {};
  FIELDS.forEach((f) => { data[f] = document.getElementById(f).value.trim(); });
  chrome.storage.sync.set(data, () => {
    const s = document.getElementById('status');
    s.textContent = 'Saved!';
    setTimeout(() => { s.textContent = ''; }, 1500);
  });
});
