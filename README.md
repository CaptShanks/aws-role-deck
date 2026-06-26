# RoleDeck

**RoleDeck** is a faster, safer AWS IAM role switcher for Chrome, Edge, and Firefox — a heavily extended fork of [AWS Extend Switch Roles](https://github.com/tilfinltd/aws-extend-switch-roles). On top of the original aws-config-style role list it adds:

- 🎨 **Color-coded Firefox containers** — open each profile in its own isolated container tab; child/tree tabs stay in the same container.
- 🛡️ **Production guardrails** — profiles in production (by `env` or name) ask for confirmation before you switch, with `PROD`/`STG`/`DEV` badges in the list.
- ⭐ **Favorites & recents** — star the roles you use most; recently used roles float to the top.
- 🔎 **Command-palette popup** — a redesigned popup with fuzzy search and full keyboard control (↑/↓, Enter, Esc).
- ⏱️ **Session auto-renew** — silently re-assume the role before the 1-hour switch-role limit so you stay signed in.
- 📝 **Visual profile editor & config upload** — add profiles from a form, or **drag-and-drop your `~/.aws/config`** to auto-discover switchable roles (static credentials, `[sso-session]` blocks, and incomplete entries are filtered out, with a summary of what was kept and skipped). Import/export the whole config as a file too.
- 🚨 **In-console production banner** — a persistent red border + ribbon whenever you're in a production account, with an optional idle auto-lock.
- 📜 **Local activity log** — a private, exportable (CSV) history of your role switches; never leaves your browser.
- ⌨️ **Quick-switch & deep links** — `Alt`+`1–9` to jump straight to a role, a `start_url` to land on a specific console page, and one-click "open all favorites" container workspaces.
- 🧹 **Config linter & managed config** — validate your config inline (dangling references, duplicates, bad ARNs), or fetch a read-only team config from a URL.

All settings are unlocked for everyone (no supporter gate). RoleDeck still reads the same `~/.aws/config`-style configuration as the original.

## Firefox container tabs (fork feature)

- Selecting a profile opens it in a **new container tab**; the container is created automatically and named after the profile (or a custom name).
- The container **color is configurable per account** with `container_color` (`blue`, `turquoise`, `green`, `yellow`, `orange`, `red`, `pink`, `purple`, `toolbar`). If omitted, the nearest container color is derived from the profile's `color` value. An icon can be set with `container_icon`.
- **Tabs opened from a container tab — including tree-style child tabs — stay in the same container.** Firefox inherits the container for tabs opened from links natively, and the add-on additionally moves stray child tabs (e.g. created by other extensions in the default container) back into the opener's container.
- Enable it per profile with `container = true`, or for all profiles at once with the *"Open each profile in its own container tab"* setting on the options page (profiles can opt out with `container = false`). Setting `container = <name>` lets several profiles share one container.
- The first switch in a fresh container asks you to sign in to AWS within that container (containers have isolated cookies); after that, each container keeps its own session.
- Chrome/Edge behavior is unchanged (containers are a Firefox-only feature).

```ini
[profile production-admin]
role_arn = arn:aws:iam::123456789012:role/Admin
color = ff3333
container = true
container_color = red

[profile staging-admin]
role_arn = arn:aws:iam::210987654321:role/Admin
container = true
container_color = orange
container_icon = circle
```

To install: run `npm install && npm run build`, then load `dist/firefox` as a temporary add-on via `about:debugging`, or zip it (`npm run archive`) and install the artifact.

## Switch-role session auto-renew (fork feature)

An AWS Management Console *switch-role* session is hard-capped at **1 hour** by AWS — it cannot be extended by activity or keep-alive pings, and raising the IAM role's max session duration does not change the console limit. The only way to keep working is to re-assume the role.

Enable **"Automatically renew a switched-role session before it expires"** on the options page and the add-on will:

- record when you switched into a role and set an alarm ~5 minutes before the 1-hour limit;
- automatically re-assume the role when the alarm fires, **silently reloading the tab** to the page you're on so the session keeps rolling over hour after hour;
- clean up automatically when the tab is closed.

Caveats: because renewal reloads the tab, **unsaved input on the console page can be lost**. Renewal only works while your underlying base login (IAM user / SSO / federated) is still valid, and it is **not** applied to multi-session ("Prism") tabs. Works on both Chrome and Firefox.

---

Original README follows.

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/jpmkfafbacpgapdghgdpembnojdlgkdl.svg)](https://chromewebstore.google.com/detail/aws-extend-switch-roles/jpmkfafbacpgapdghgdpembnojdlgkdl?utm_source=github)
[![Firefox Add-on](https://img.shields.io/amo/v/aws-extend-switch-roles3.svg)](https://addons.mozilla.org/ja/firefox/addon/aws-extend-switch-roles3/)
[![Edge Add-on](https://img.shields.io/badge/dynamic/json?label=edge%20add-on&prefix=v&query=%24.version&url=https%3A%2F%2Fmicrosoftedge.microsoft.com%2Faddons%2Fgetproductdetailsbycrxid%2Fdcflbohnocoeheondddeoknmgbngijbi)](https://microsoftedge.microsoft.com/addons/detail/aws-extend-switch-roles/dcflbohnocoeheondddeoknmgbngijbi)

Extend your AWS IAM switching roles by Chrome extension, Firefox add-on, or Edge add-on

Switch role history only stores the last 5 roles (maximum) on the AWS Management Console.
This extension shows a menu of switchable roles that you can configure manually.

- Supports the Sync feature on all sorts of browsers
- Not support switching between AWS accounts you sign into with AWS SSO or SAML solution providers directly
- Support for **multi-session** on the AWS Management Console

## Large Supporters

<a href="https://classmethod.jp/" rel="noopener"><img alt="Classmethod, Inc." src="https://aesr.tilfin.com/supporters/img/classmethod.png" width="208" height="90"></a>

## Development and Distribution Guideline

#### Minimizes required permissions and operates only on AWS Console pages
A browser plug-in goes with security risks. AWS Management Console allows you to manipulate your essential data.

#### Supports only the  latest version of each official browser
This extension does not restrict the use of other compatible browsers. The version restrictions are only due to the JavaScript language features used.

## Install

- [AWS Extend Switch Roles - Chrome Web Store](https://chromewebstore.google.com/detail/aws-extend-switch-roles/jpmkfafbacpgapdghgdpembnojdlgkdl?utm_source=github)
- [AWS Extend Switch Roles :: Add-ons for Firefox](https://addons.mozilla.org/firefox/addon/aws-extend-switch-roles3/)
- [AWS Extend Switch Roles - Microsoft Edge Addons](https://microsoftedge.microsoft.com/addons/detail/aws-extend-switch-roles/dcflbohnocoeheondddeoknmgbngijbi)

## Configuration

Left-click the extension, click "Configure", enter your configuration in the text box, and click "Save".
You can write the configuration in INI format like `~/.aws/config` or `~/.aws/credentials`.

### Simple Configuration
The simplest configuration is for multiple **target roles** when you always intend to show the whole list.  **Target roles** can be expressed with a `role_arn` or with both `aws_account_id` and `role_name`.

#### Optional parameters

* `color` - The RGB hex value (without the prefix '#') for the color of the header bottom border and around the current profile.
* `region` - Changing the region whenever switching the role if this parameter is specified.
* `image` - The uri of an image to use on top of any color attribute supplied. The color and image are not mutually exclusive.

```
[profile marketingadmin]
role_arn = arn:aws:iam::123456789012:role/marketingadmin
color = ffaaee

[anotheraccount]
aws_account_id = 987654321987
role_name = anotherrole
region=ap-northeast-1

[athirdaccount]
aws_account_id = 987654321988
role_name = athirdrole
image = "https://aesr.dev/img/150"
```

### Complex Configuration
More complex configurations involve multiple AWS accounts and/or organizations.

- A profile specified by the `source_profile` of the others is defined as a **base account**.

- If your account is aliased, you specify `aws_account_alias` in **base account**.

- If an `role_name` is specified in a **base account** it will also check for the role that is used to login to AWS. This can be used to select a subset of accounts when you are using an SSO IdP to login to AWS. If a role name starts with *AWSReservedSSO_*, the value should be only the **permission set** name.

- A **target role** is associated with a **base account** by its `source_profile` specifying the profile name of the base account.

- As above, **target roles** can be expressed with a `role_arn` or with both `aws_account_id` and `role_name` and can optionally pass the optional parameters.

- If `target_role_name` is set in **base account**, the value is provided as the default role name for each **target roles**.
- If `target_region` is set in **base account**, the value is provided as the default region for each **target roles**.

```
[organization1]
aws_account_id = 000011112222
aws_account_alias = your-account-alias ; If your account is aliased

[Org1-Account1-Role1]
role_arn = arn:aws:iam::123456789012:role/Role1
source_profile = organization1

[Org1-Account1-Role2]
aws_account_id = 123456789012
role_name = Role2
source_profile = organization1

[Org1-Account2-Role1]
aws_account_id = 210987654321
role_name = Role1
source_profile = organization1

[baseaccount2]
aws_account_id = 000000000000

[Base2-Role1]
role_arn = arn:aws:iam::234567890123:role/Role1
source_profile = baseaccount2

[AnotherRole]
role_name = SomeOtherRole
aws_account_id = account-3-alias

;
; target_role_name example
;
[Org2-BaseAccount]
aws_account_id = 222200000000
target_role_name = Developer

[Org2-Account1-Developer]
aws_account_id = 222200001111
source_profile = Org2-BaseAccount

[Org2-Account2-Manager]
aws_account_id = 222200002222
role_name = Manager ; overrides target role name
source_profile = Org2-BaseAccount

;
; base account with role_name example
;
[Org3-BaseAccount1]
aws_account_id = 333300000000
role_name = Entry-Role-1 ; Role for Federated Login, or User to login

[Org3-BaseAccount2]
aws_account_id = 333300000000
aws_account_alias = mycompany
role_name = custom_permission-set ; DO NOT set AWSReservedSSO_custom_permission-set_0123456890abcdef

[Org3-Account1-Role1]
aws_account_id = 333300001111
role_name = Role1
source_profile = Org3-BaseAccount1

[Org2-Account2-Role2]
aws_account_id = 222200002222
role_name = Role2
source_profile = Org3-BaseAccount2
```

If you sign-in a base account, target roles of the other base accounts are excluded.

The 'Show only matching roles' setting is for use with more sophisticated account structures where you're using AWS Organizations with multiple accounts along with AWS Federated Logins via something like Active Directory or Google GSuite.  Common practice is to have a role in the master account that is allowed to assume a role of the same name in other member accounts.  Checking this box means that if you're logged in to the 'Developer' role in the master account, only member accounts with a role_arn ending in 'role/Developer' will be shown.  You won't see roles that your current role can't actually assume.

## Settings

- **Hide account id** hides the account_id for each profile.
- **Show only matching roles** filters to only show profiles with roles that match your role in your master account.
- **Automatic tab grouping for multi-session (Chrome & Edge)** automatically organizes tabs from the same AWS Management Console multi-session into tab groups. The tab group name will be the corresponding profile name. When a tab group is removed, the corresponding session will be automatically signed out.
- **Sign-in endpoint in current region** instead of *signin.aws.amazon.com* when you browse a non-global page in AWS Management Console. For those working geographically far from Virginia, the switch role may be a little faster.
- ~~**Automatically assume last assumed role** automatically assumes last assumed role on the next sign-in if did not back to the base account and signed out.~~ **temporarily disabled**
- **Configuration storage** specifies which storage to save to. 'Sync' can automatically share it between browsers with your account but cannot store many profiles. 'Local' is the exact opposite of 'Sync.'
- **Visual mode** specifies whether light mode or dark mode is applied to the UI appearance.

## Keyboard Navigation

The popup interface supports keyboard navigation for efficient role switching:

### Filter Input
- Type to filter roles by name or account ID
- **Enter** - Select the currently highlighted role and switch to it
- **Escape** - Clear the filter and close the popup

### Role Navigation
- **Arrow Down** - Highlight the next visible role in the filtered list
- **Arrow Up** - Highlight the previous visible role in the filtered list
- **Enter** - Switch to the currently highlighted role

### Usage Example
1. Open the extension popup (click the extension icon)
2. Type part of a role name (e.g., "prod" to filter production roles)
3. Use **Arrow Down**/**Arrow Up** to navigate through the filtered results
4. Press **Enter** to switch to the highlighted role

## Extension API

- **Config sender extension** allowed by the **ID** can send your switch roles configuration to this extension. **'Configuration storage' forcibly becomes 'Local' when the configuration is received from a config sender.** [See](https://github.com/tilfinltd/aws-extend-switch-roles/wiki/External-API#config-sender-extension) how to make your config sender extension.

## Appearance

![Screen Shot 1](https://github.com/tilfinltd/aws-extend-switch-roles/blob/images/ScreenShot_1.png)

![Screen Shot 3](https://github.com/tilfinltd/aws-extend-switch-roles/blob/images/ScreenShot_3_960x600.png)
