import { detectEnv, envLabel } from './profile_organizer.js';

export function createRoleListItem(document, item, url, region, options, selectHandler) {
  const { hidesAccountId = false, favorites, onToggleFavorite } = options || {};

  const li = document.createElement('li');

  const anchor = document.createElement('a');
  anchor.href = '#';
  anchor.className = 'rl-row';
  anchor.title = item.role_name + '@' + item.aws_account_id;
  anchor.dataset.profile = item.name;
  anchor.dataset.rolename = item.role_name;
  anchor.dataset.account = item.aws_account_id;
  anchor.dataset.color = item.color || 'aaaaaa';
  // Deep link: if the profile names a landing page, switch straight to it
  // instead of the current console page.
  anchor.dataset.redirecturi = item.start_url
    ? encodeURIComponent(item.start_url)
    : createRedirectUri(url, region, item.region);
  anchor.dataset.search = (item.label ? item.label.toLowerCase() + ' ' : '') + item.name.toLowerCase() + ' ' + item.aws_account_id;
  if (item.label) anchor.dataset.label = item.label;
  if (item.env) anchor.dataset.env = item.env;
  if (item.container) anchor.dataset.container = item.container;
  if (item.container_color) anchor.dataset.containerColor = item.container_color;
  if (item.container_icon) anchor.dataset.containerIcon = item.container_icon;

  const headSquare = document.createElement('span');
  headSquare.textContent = ' ';
  headSquare.className = 'headSquare';
  if (item.color) {
    headSquare.style.backgroundColor = `#${item.color}`;
  } else if (!item.image) {
    // set gray if both color and image are undefined
    headSquare.style.backgroundColor = '#aaaaaa';
  }
  if (item.image) {
    headSquare.style.backgroundImage = `url('${item.image.replace(/"/g, '')}')`;
  }
  anchor.appendChild(headSquare);

  const nameEl = document.createElement('span');
  nameEl.className = 'rl-name';
  nameEl.textContent = item.label || item.name;
  anchor.appendChild(nameEl);

  const env = detectEnv(item);
  if (env) {
    const badge = document.createElement('span');
    badge.className = `rl-env env-${env}`;
    badge.textContent = envLabel(env);
    anchor.appendChild(badge);
  }

  if (hidesAccountId) {
    anchor.dataset.displayname = createDisplayName(item.label || item.name);
  } else {
    anchor.dataset.displayname = createDisplayName(item.label || item.name, item.aws_account_id);

    const accountIdSpan = document.createElement('span');
    accountIdSpan.className = 'suffixAccountId';
    accountIdSpan.textContent = item.aws_account_id;
    anchor.appendChild(accountIdSpan);
  }

  anchor.onclick = function() {
    const data = { ...this.dataset }; // do not directly refer DOM data in Firefox
    selectHandler(this, data, item);
    return false;
  }

  li.appendChild(anchor);

  if (onToggleFavorite) {
    const star = document.createElement('button');
    star.className = 'rl-star';
    const fav = !!(favorites && favorites.has && favorites.has(item.name));
    star.classList.toggle('on', fav);
    star.textContent = fav ? '★' : '☆';
    star.title = fav ? 'Remove from favorites' : 'Add to favorites';
    star.setAttribute('aria-label', star.title);
    star.onclick = function(e) {
      e.preventDefault();
      e.stopPropagation();
      const now = !star.classList.contains('on');
      star.classList.toggle('on', now);
      star.textContent = now ? '★' : '☆';
      star.title = now ? 'Remove from favorites' : 'Add to favorites';
      onToggleFavorite(item.name, now);
    };
    li.appendChild(star);
  }

  return li
}

function createRedirectUri(currentUrl, curRegion, destRegion) {
  let redirectUri = currentUrl;
  if (curRegion && destRegion && curRegion !== destRegion) {
    redirectUri = redirectUri.replace('region=' + curRegion, 'region=' + destRegion);
  }
  return encodeURIComponent(redirectUri);
}

function createDisplayName(profile, awsAccountId) {
  const maxLength = 64;
  const separator = '  |  ';
  const overflow = '…';

  let displayName = profile;
  let totalLength = displayName.length;

  if (awsAccountId !== undefined) {
    totalLength += separator.length + awsAccountId.length;
  }

  if (totalLength > maxLength) {
    displayName = displayName.substring(0, displayName.length - (totalLength - maxLength) - overflow.length)
                  + overflow;
  }

  if (awsAccountId !== undefined) {
    displayName += separator + awsAccountId;
  }

  return displayName;
}
