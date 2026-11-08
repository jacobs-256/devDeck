// @ts-nocheck
export default {
  name: 'Client Certificate',
  description: 'Issue client certificate with CA',
  // section titles
  sectionCA: 'CA Certificate Info',
  sectionCSR: 'CSR',
  csrHint: 'Optional, auto-generated if not provided',
  sectionClient: 'Client Certificate Info',
  // CA inputs
  caCertLabel: 'CA Certificate (PEM)',
  caKeyLabel: 'CA Private Key (PEM)',
  caCertPlaceholder: 'Paste CA certificate PEM content...',
  caKeyPlaceholder: 'Paste CA private key PEM content...',
  commonName: 'Common Name (CN)',
  organization: 'Organization (O)',
  organizationalUnit: 'Organizational Unit (OU)',
  country: 'Country (C)',
  state: 'State (ST)',
  locality: 'Locality (L)',
  csrPlaceholder: 'Paste CSR PEM content (optional)...',
  // form
  optional: 'Optional',
  optionalCountry: 'Optional, 2-letter code',
  placeholderOrg: 'Company name',
  placeholderOU: 'Department name',
  placeholderState: 'Province / State',
  placeholderCity: 'City',
  keySize: 'Key Size',
  validity: 'Validity',
  // validity options
  year1: '1 Year',
  year2: '2 Years',
  year5: '5 Years',
  year10: '10 Years',
  // buttons
  import: 'Import',
  generating: 'Generating...',
  generate: 'Generate Client Certificate',
  copy: 'Copy',
  save: 'Save',
  // tabs
  tabCert: 'Certificate',
  tabKey: 'Private Key',
  // files
  pemFiles: 'PEM Files',
  allFiles: 'All Files',
  fileLabel: 'Files',
  // error & hint
  generateFailed: 'Generation failed',
  errNoCACert: 'Please provide CA certificate',
  errNoCAKey: 'Please provide CA private key',
  emptyHint: 'Import CA certificate and private key, fill in the form and click Generate',
};
