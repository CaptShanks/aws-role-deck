//
// RoleDeck: build an INI profile block from the visual profile editor fields.
// Pure function; throws an Error with a user-facing message on invalid input.
//

const CONTAINER_COLORS = ['blue', 'turquoise', 'green', 'yellow', 'orange', 'red', 'pink', 'purple', 'toolbar'];

export function buildProfileIni(fields = {}) {
  const name = (fields.name || '').trim();
  if (!name) throw new Error('Profile name is required.');
  if (/[\[\]]/.test(name)) throw new Error('Profile name cannot contain [ or ].');

  const lines = [`[${name}]`];

  const roleArn = (fields.roleArn || '').trim();
  const accountId = (fields.accountId || '').trim();
  const roleName = (fields.roleName || '').trim();

  if (roleArn) {
    if (!/^arn:aws[\w-]*:iam::\d{12}:role\/.+/.test(roleArn)) {
      throw new Error('Role ARN looks invalid (expected arn:aws:iam::<account>:role/<name>).');
    }
    lines.push(`role_arn = ${roleArn}`);
  } else {
    if (!accountId) throw new Error('Provide an AWS account ID or a role ARN.');
    if (!/^\d{12}$/.test(accountId) && !/^[\w-]+$/.test(accountId)) {
      throw new Error('AWS account ID must be 12 digits or an account alias.');
    }
    lines.push(`aws_account_id = ${accountId}`);
    if (roleName) lines.push(`role_name = ${roleName}`);
  }

  const sourceProfile = (fields.sourceProfile || '').trim();
  if (sourceProfile) lines.push(`source_profile = ${sourceProfile}`);

  const label = (fields.label || '').trim();
  if (label) lines.push(`label = ${label}`);

  const region = (fields.region || '').trim();
  if (region) lines.push(`region = ${region}`);

  const color = (fields.color || '').trim().replace(/^#/, '');
  if (color) {
    if (!/^[0-9a-fA-F]{6}$/.test(color)) throw new Error('Color must be a 6-digit hex value.');
    lines.push(`color = ${color.toLowerCase()}`);
  }

  const env = (fields.env || '').trim().toLowerCase();
  if (env && env !== 'none') lines.push(`env = ${env}`);

  if (parseConfirm(fields.confirm)) lines.push('confirm = true');

  const container = (fields.container || '').trim();
  if (container && container.toLowerCase() !== 'off') {
    lines.push(`container = ${container}`); // 'true' or a custom container name
    const cc = (fields.containerColor || '').trim().toLowerCase();
    if (cc && CONTAINER_COLORS.includes(cc)) lines.push(`container_color = ${cc}`);
    const ci = (fields.containerIcon || '').trim().toLowerCase();
    if (ci) lines.push(`container_icon = ${ci}`);
  }

  return lines.join('\n');
}

function parseConfirm(v) {
  return v === true || ['true', 'yes', 'on', '1'].includes(String(v).toLowerCase());
}
