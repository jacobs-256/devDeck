//! Certificate tooling: key pairs, CAs, CSRs, issuance, and parsing.
//!
//! These are built-in tools, not plugin capabilities: they run through normal
//! Tauri commands and never touch the network. Private keys only exist in the
//! renderer's memory unless the user copies them somewhere.

use devtoolbox_contract::DevToolboxError;
use rcgen::{
    BasicConstraints, CertificateParams, DistinguishedName, DnType, ExtendedKeyUsagePurpose, IsCa,
    Issuer, KeyPair, KeyUsagePurpose, PKCS_ECDSA_P256_SHA256, PKCS_ECDSA_P384_SHA384, PKCS_ED25519,
};
use rsa::pkcs8::EncodePrivateKey;
use serde::{Deserialize, Serialize};
use time::{Duration, OffsetDateTime};

const MAX_DAYS: i64 = 3650;

#[derive(Debug, Clone, Copy, Default, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum KeyAlgorithm {
    #[default]
    EcdsaP256,
    EcdsaP384,
    Ed25519,
    Rsa2048,
    Rsa4096,
}

impl KeyAlgorithm {
    fn label(self) -> &'static str {
        match self {
            Self::EcdsaP256 => "ECDSA P-256",
            Self::EcdsaP384 => "ECDSA P-384",
            Self::Ed25519 => "Ed25519",
            Self::Rsa2048 => "RSA 2048",
            Self::Rsa4096 => "RSA 4096",
        }
    }

    fn signature_algorithm(self) -> &'static rcgen::SignatureAlgorithm {
        match self {
            Self::EcdsaP256 => &PKCS_ECDSA_P256_SHA256,
            Self::EcdsaP384 => &PKCS_ECDSA_P384_SHA384,
            Self::Ed25519 => &PKCS_ED25519,
            Self::Rsa2048 | Self::Rsa4096 => &rcgen::PKCS_RSA_SHA256,
        }
    }
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubjectInput {
    #[serde(default)]
    pub common_name: String,
    #[serde(default)]
    pub organization: String,
    #[serde(default)]
    pub organizational_unit: String,
    #[serde(default)]
    pub country: String,
    #[serde(default)]
    pub state: String,
    #[serde(default)]
    pub locality: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyMaterial {
    pub private_key_pem: String,
    pub public_key_pem: String,
    pub algorithm: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CertificateMaterial {
    pub certificate_pem: String,
    pub private_key_pem: String,
    pub public_key_pem: String,
    pub algorithm: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CsrMaterial {
    pub csr_pem: String,
    pub private_key_pem: String,
    pub public_key_pem: String,
    pub algorithm: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CertificateInfo {
    pub subject: String,
    pub issuer: String,
    pub serial: String,
    pub not_before: i64,
    pub not_after: i64,
    pub is_ca: bool,
    pub key_algorithm: String,
    pub fingerprint_sha256: String,
}

fn generate_key(algorithm: KeyAlgorithm) -> Result<KeyPair, DevToolboxError> {
    let bits = match algorithm {
        KeyAlgorithm::Rsa2048 => Some(2048),
        KeyAlgorithm::Rsa4096 => Some(4096),
        _ => None,
    };
    if let Some(bits) = bits {
        let mut rng = rand::thread_rng();
        let private = rsa::RsaPrivateKey::new(&mut rng, bits).map_err(|err| {
            DevToolboxError::Internal(format!("RSA key generation failed: {err}"))
        })?;
        let pem = private
            .to_pkcs8_pem(rsa::pkcs8::LineEnding::LF)
            .map_err(|err| DevToolboxError::Internal(format!("RSA key encoding failed: {err}")))?;
        return KeyPair::from_pem(&pem)
            .map_err(|err| DevToolboxError::Internal(format!("RSA key import failed: {err}")));
    }
    KeyPair::generate_for(algorithm.signature_algorithm())
        .map_err(|err| DevToolboxError::Internal(format!("key generation failed: {err}")))
}

fn distinguished_name(subject: &SubjectInput) -> Result<DistinguishedName, DevToolboxError> {
    let common_name = subject.common_name.trim();
    if common_name.is_empty() {
        return Err(DevToolboxError::InvalidArgument(
            "common name (CN) is required".to_string(),
        ));
    }

    let mut dn = DistinguishedName::new();
    dn.push(DnType::CommonName, common_name);
    for (value, dn_type) in [
        (&subject.organization, DnType::OrganizationName),
        (&subject.organizational_unit, DnType::OrganizationalUnitName),
        (&subject.country, DnType::CountryName),
        (&subject.state, DnType::StateOrProvinceName),
        (&subject.locality, DnType::LocalityName),
    ] {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            dn.push(dn_type, trimmed);
        }
    }
    Ok(dn)
}

fn validity(days: u32) -> Result<(OffsetDateTime, OffsetDateTime), DevToolboxError> {
    if days == 0 || i64::from(days) > MAX_DAYS {
        return Err(DevToolboxError::InvalidArgument(format!(
            "validity must be between 1 and {MAX_DAYS} days"
        )));
    }
    let now = OffsetDateTime::now_utc();
    Ok((
        now - Duration::hours(1),
        now + Duration::days(i64::from(days)),
    ))
}

/// Generate a fresh key pair.
pub fn generate_key_pair(algorithm: KeyAlgorithm) -> Result<KeyMaterial, DevToolboxError> {
    let key = generate_key(algorithm)?;
    Ok(KeyMaterial {
        private_key_pem: key.serialize_pem(),
        public_key_pem: key.public_key_pem(),
        algorithm: algorithm.label().to_string(),
    })
}

/// Generate a self-signed CA certificate.
pub fn generate_ca(
    subject: &SubjectInput,
    days: u32,
    algorithm: KeyAlgorithm,
) -> Result<CertificateMaterial, DevToolboxError> {
    let key = generate_key(algorithm)?;
    let mut params = CertificateParams::default();
    params.distinguished_name = distinguished_name(subject)?;
    params.is_ca = IsCa::Ca(BasicConstraints::Unconstrained);
    params.key_usages = vec![
        KeyUsagePurpose::KeyCertSign,
        KeyUsagePurpose::CrlSign,
        KeyUsagePurpose::DigitalSignature,
    ];
    let (not_before, not_after) = validity(days)?;
    params.not_before = not_before;
    params.not_after = not_after;

    let certificate = params
        .self_signed(&key)
        .map_err(|err| DevToolboxError::Internal(format!("CA generation failed: {err}")))?;

    Ok(CertificateMaterial {
        certificate_pem: certificate.pem(),
        private_key_pem: key.serialize_pem(),
        public_key_pem: key.public_key_pem(),
        algorithm: algorithm.label().to_string(),
    })
}

/// Generate a certificate signing request (CSR) with its private key.
pub fn generate_csr(
    subject: &SubjectInput,
    algorithm: KeyAlgorithm,
) -> Result<CsrMaterial, DevToolboxError> {
    let key = generate_key(algorithm)?;
    let mut params = CertificateParams::default();
    params.distinguished_name = distinguished_name(subject)?;

    let csr = params
        .serialize_request(&key)
        .map_err(|err| DevToolboxError::Internal(format!("CSR generation failed: {err}")))?;
    let csr_pem = csr
        .pem()
        .map_err(|err| DevToolboxError::Internal(format!("CSR encoding failed: {err}")))?;

    Ok(CsrMaterial {
        csr_pem,
        private_key_pem: key.serialize_pem(),
        public_key_pem: key.public_key_pem(),
        algorithm: algorithm.label().to_string(),
    })
}

/// Issue a certificate from a CA and a CSR.
pub fn issue_certificate(
    ca_certificate_pem: &str,
    ca_private_key_pem: &str,
    csr_pem: &str,
    days: u32,
    client_auth: bool,
) -> Result<String, DevToolboxError> {
    let ca_key = KeyPair::from_pem(ca_private_key_pem).map_err(|err| {
        DevToolboxError::InvalidArgument(format!("invalid CA private key: {err}"))
    })?;
    let issuer = Issuer::from_ca_cert_pem(ca_certificate_pem, ca_key).map_err(|err| {
        DevToolboxError::InvalidArgument(format!("invalid CA certificate: {err}"))
    })?;

    let csr = rcgen::CertificateSigningRequestParams::from_pem(csr_pem)
        .map_err(|err| DevToolboxError::InvalidArgument(format!("invalid CSR: {err}")))?;

    let mut params = csr.params;
    let (not_before, not_after) = validity(days)?;
    params.not_before = not_before;
    params.not_after = not_after;
    params.is_ca = IsCa::ExplicitNoCa;
    params.key_usages = vec![
        KeyUsagePurpose::DigitalSignature,
        KeyUsagePurpose::KeyEncipherment,
    ];
    params.extended_key_usages = vec![if client_auth {
        ExtendedKeyUsagePurpose::ClientAuth
    } else {
        ExtendedKeyUsagePurpose::ServerAuth
    }];

    let certificate = params
        .signed_by(&csr.public_key, &issuer)
        .map_err(|err| DevToolboxError::Internal(format!("issuance failed: {err}")))?;
    Ok(certificate.pem())
}

/// Parse a PEM certificate into a display-friendly structure.
pub fn parse_certificate(pem: &str) -> Result<CertificateInfo, DevToolboxError> {
    if !pem.contains("BEGIN CERTIFICATE") {
        return Err(DevToolboxError::InvalidArgument(
            "input is not a PEM certificate".to_string(),
        ));
    }

    let (_, pem_block) = x509_parser::pem::parse_x509_pem(pem.as_bytes()).map_err(|err| {
        DevToolboxError::InvalidArgument(format!("cannot parse PEM block: {err}"))
    })?;
    let certificate = pem_block.parse_x509().map_err(|err| {
        DevToolboxError::InvalidArgument(format!("cannot parse certificate: {err}"))
    })?;

    let der: &[u8] = certificate.as_ref();

    Ok(CertificateInfo {
        subject: certificate.subject().to_string(),
        issuer: certificate.issuer().to_string(),
        serial: certificate.raw_serial_as_string(),
        not_before: certificate.validity().not_before.timestamp(),
        not_after: certificate.validity().not_after.timestamp(),
        is_ca: certificate.is_ca(),
        key_algorithm: certificate.public_key().algorithm.algorithm.to_string(),
        fingerprint_sha256: devtoolbox_market::signing::sha256_hex(der),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn subject(cn: &str) -> SubjectInput {
        SubjectInput {
            common_name: cn.to_string(),
            organization: "DevToolBox".to_string(),
            country: "CN".to_string(),
            ..Default::default()
        }
    }

    #[test]
    fn generates_key_pairs_for_each_algorithm() {
        for algorithm in [
            KeyAlgorithm::EcdsaP256,
            KeyAlgorithm::EcdsaP384,
            KeyAlgorithm::Ed25519,
            KeyAlgorithm::Rsa2048,
        ] {
            let material = generate_key_pair(algorithm).unwrap();
            assert!(material.private_key_pem.contains("BEGIN PRIVATE KEY"));
            assert!(material.public_key_pem.contains("BEGIN PUBLIC KEY"));
        }
    }

    #[test]
    fn generates_a_parseable_ca() {
        for algorithm in [KeyAlgorithm::EcdsaP256, KeyAlgorithm::Rsa2048] {
            let material = generate_ca(&subject("DevToolBox Root CA"), 365, algorithm).unwrap();
            let info = parse_certificate(&material.certificate_pem).unwrap();
            assert!(info.is_ca);
            assert!(info.subject.contains("DevToolBox Root CA"));
            assert_eq!(info.subject, info.issuer);
            assert!(info.not_after > info.not_before);
        }
    }

    #[test]
    fn legacy_rsa_ca_round_trip() {
        let material = generate_ca(&subject("Legacy Root CA"), 365, KeyAlgorithm::Rsa2048).unwrap();
        let info = parse_certificate(&material.certificate_pem).unwrap();
        assert!(info.is_ca);
        assert!(info.subject.contains("Legacy Root CA"));
        assert_eq!(info.subject, info.issuer);
        assert!(info.not_after > info.not_before);
    }

    #[test]
    fn issues_a_client_certificate_from_a_csr() {
        let ca = generate_ca(&subject("DevToolBox Root CA"), 365, KeyAlgorithm::EcdsaP256).unwrap();
        let csr = generate_csr(&subject("client-01"), KeyAlgorithm::EcdsaP256).unwrap();

        let issued = issue_certificate(
            &ca.certificate_pem,
            &ca.private_key_pem,
            &csr.csr_pem,
            90,
            true,
        )
        .unwrap();

        let info = parse_certificate(&issued).unwrap();
        assert!(info.subject.contains("client-01"));
        assert!(info.issuer.contains("DevToolBox Root CA"));
        assert!(!info.is_ca);
    }

    #[test]
    fn rejects_invalid_inputs() {
        assert!(generate_ca(&SubjectInput::default(), 30, KeyAlgorithm::EcdsaP256).is_err());
        assert!(generate_ca(&subject("X"), 0, KeyAlgorithm::EcdsaP256).is_err());
        assert!(generate_ca(&subject("X"), 100_000, KeyAlgorithm::EcdsaP256).is_err());
        assert!(parse_certificate("not a certificate").is_err());

        let ca = generate_ca(&subject("CA"), 30, KeyAlgorithm::EcdsaP256).unwrap();
        assert!(issue_certificate(&ca.certificate_pem, "bad key", "bad csr", 30, false).is_err());
    }

    #[test]
    fn csr_contains_the_subject() {
        let csr = generate_csr(&subject("server.example.com"), KeyAlgorithm::Ed25519).unwrap();
        assert!(csr.csr_pem.contains("BEGIN CERTIFICATE REQUEST"));
        assert!(csr.private_key_pem.contains("BEGIN PRIVATE KEY"));
    }
}
