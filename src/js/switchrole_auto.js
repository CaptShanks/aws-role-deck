//
// RoleDeck: auto-confirm AWS's "Switch Role" page for switches that RoleDeck
// initiated. When a profile is opened in a fresh container the switch is a GET
// that lands on AWS's Switch Role confirmation page; this clicks "Switch Role"
// so the user doesn't have to.
//
// Gated on the "#rd-auto" URL fragment (added only by RoleDeck's container
// switch URL, and never sent to the server), so it never auto-submits a page
// the user navigated to manually.
//
(function () {
  if (!location.hash.includes('rd-auto')) return;
  if (!/\/switchrole/i.test(location.pathname)) return;

  function findSwitchButton() {
    const els = Array.from(document.querySelectorAll('button, input[type="submit"], [role="button"]'));
    return els.find(el => {
      const t = (el.textContent || el.value || '').trim().toLowerCase();
      if (!t || t.includes('cancel')) return false;
      return /\bswitch roles?\b/.test(t);
    });
  }

  let attempts = 0;
  let done = false;
  function attempt() {
    if (done) return;
    attempts++;
    const btn = findSwitchButton();
    if (btn && !btn.disabled) {
      done = true;
      btn.click();
      return;
    }
    if (attempts < 40) setTimeout(attempt, 250); // the page renders asynchronously
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attempt);
  } else {
    attempt();
  }
})();
