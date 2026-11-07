// @ts-nocheck
export default {
  name: 'Cert Viewer',
  description: 'View certificate details',
  // action buttons
  import: 'Import',
  parse: 'Parse',
  clear: 'Clear',
  // input area
  certPem: 'Certificate (PEM)',
  placeholder: 'Paste PEM content, or click Import...',
  emptyHint: 'Paste or import a certificate to view details',
  // errors
  parseFailed: 'Parse failed',
  cannotParse: 'Unable to parse certificate',
  // file picker
  certFiles: 'Certificate Files',
  allFiles: 'All Files',
  // status
  status: 'Status',
  caCert: 'CA Certificate',
  endCert: 'End-Entity Certificate',
  expired: 'Expired',
  valid: 'Valid',
  // section titles
  subject: 'Subject',
  issuer: 'Issuer',
  validity: 'Validity',
  publicKey: 'Public Key',
  serialNumber: 'Serial Number',
  fingerprint: 'Fingerprint',
  extensions: 'Extensions',
  // validity fields
  validFrom: 'Not Before',
  validTo: 'Not After',
  // public key fields
  algorithm: 'Algorithm',
  keySize: 'Key Size',
};
