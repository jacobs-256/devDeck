/** Builds the data shown in the install/detail consent screen. */

import type { CatalogEntry, InstalledPlugin } from '../types';
import { authorName } from '../types';
import { describePermissions, type PermissionInfo } from './permissions';
import { compareVersions } from './version';

export interface ConsentDetails {
  id: string;
  name: string;
  version: string;
  sourceName: string;
  author: string;
  license: string;
  homepage?: string;
  repository?: string;
  isUpdate: boolean;
  installedVersion?: string;
  permissions: PermissionInfo[];
  sensitive: PermissionInfo[];
  httpDomains: string[];
  envAllowlist: string[];
}

export function buildConsent(entry: CatalogEntry, installed?: InstalledPlugin): ConsentDetails {
  const permissions = describePermissions(entry.manifest.permissions);
  const isUpdate =
    installed !== undefined && compareVersions(entry.manifest.version, installed.manifest.version) > 0;

  return {
    id: entry.manifest.id,
    name: entry.manifest.name,
    version: entry.manifest.version,
    sourceName: entry.sourceName,
    author: authorName(entry.manifest.author),
    license: entry.manifest.license,
    homepage: entry.manifest.homepage,
    repository: entry.manifest.repository,
    isUpdate,
    installedVersion: installed?.manifest.version,
    permissions,
    sensitive: permissions.filter((permission) => permission.sensitive),
    httpDomains: [...entry.manifest.httpDomains].sort(),
    envAllowlist: [...entry.manifest.envAllowlist].sort(),
  };
}
