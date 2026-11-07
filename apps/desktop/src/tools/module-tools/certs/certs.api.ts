/** Tauri commands backing the certificate tools. */

import { invoke } from '@tauri-apps/api/core';

export type KeyAlgorithm = 'ecdsa-p256' | 'ecdsa-p384' | 'ed25519';

export const ALGORITHM_LABELS: Record<KeyAlgorithm, string> = {
  'ecdsa-p256': 'ECDSA P-256',
  'ecdsa-p384': 'ECDSA P-384',
  ed25519: 'Ed25519',
};

export interface SubjectInput {
  commonName: string;
  organization: string;
  organizationalUnit: string;
  country: string;
  state: string;
  locality: string;
}

export interface KeyMaterial {
  privateKeyPem: string;
  publicKeyPem: string;
  algorithm: string;
}

export interface CertificateMaterial extends KeyMaterial {
  certificatePem: string;
}

export interface CsrMaterial extends KeyMaterial {
  csrPem: string;
}

export interface CertificateInfo {
  subject: string;
  issuer: string;
  serial: string;
  /** Unix seconds. */
  notBefore: number;
  /** Unix seconds. */
  notAfter: number;
  isCa: boolean;
  keyAlgorithm: string;
  fingerprintSha256: string;
}

export function emptySubject(): SubjectInput {
  return {
    commonName: '',
    organization: '',
    organizationalUnit: '',
    country: '',
    state: '',
    locality: '',
  };
}

export function generateKeyPair(algorithm: KeyAlgorithm): Promise<KeyMaterial> {
  return invoke<KeyMaterial>('cert_generate_key', { algorithm });
}

export function generateCa(
  subject: SubjectInput,
  days: number,
  algorithm: KeyAlgorithm,
): Promise<CertificateMaterial> {
  return invoke<CertificateMaterial>('cert_generate_ca', { subject, days, algorithm });
}

export function generateCsr(subject: SubjectInput, algorithm: KeyAlgorithm): Promise<CsrMaterial> {
  return invoke<CsrMaterial>('cert_generate_csr', { subject, algorithm });
}

export function issueCertificate(params: {
  caCertificatePem: string;
  caPrivateKeyPem: string;
  csrPem: string;
  days: number;
  clientAuth: boolean;
}): Promise<string> {
  return invoke<string>('cert_issue', params);
}

export function parseCertificate(pem: string): Promise<CertificateInfo> {
  return invoke<CertificateInfo>('cert_parse', { pem });
}

export function formatTimestamp(seconds: number): string {
  return new Date(seconds * 1000)
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d+Z$/, ' UTC');
}
