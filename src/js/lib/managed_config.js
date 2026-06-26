import { ConfigParser } from 'aesr-config';
import { writeProfileSetToTable } from './profile_db.js';
import { saveConfigIni } from './config_ini.js';
import { StorageProvider } from './storage_repository.js';
import { nowEpochSeconds } from './util.js';

// Parse a managed (team-published) config text and apply it to local storage
// and the profile DB. Throws (via ConfigParser) when the text is invalid.
export async function applyManagedConfig(text) {
  const profileSet = ConfigParser.parseIni(text);
  const local = StorageProvider.getLocalRepository();
  await saveConfigIni(local, text);
  await writeProfileSetToTable(profileSet);
  await local.set({ profilesTableUpdated: nowEpochSeconds() });
  return profileSet;
}
