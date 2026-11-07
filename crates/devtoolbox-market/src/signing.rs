//! Package integrity and provenance checks.

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use devtoolbox_contract::DevToolboxError;
use ed25519_dalek::{Signature, VerifyingKey};
use sha2::{Digest, Sha256};

/// Lowercase hex SHA-256 of `bytes`.
pub fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

/// Lowercase hex SHA-256 of a file's contents.
pub fn sha256_file(path: &std::path::Path) -> Result<String, DevToolboxError> {
    use std::io::Read;
    let mut file = std::fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

/// Verify that `bytes` match an expected lowercase hex SHA-256 digest.
pub fn verify_sha256(bytes: &[u8], expected_hex: &str) -> Result<(), DevToolboxError> {
    let expected = expected_hex.trim().to_ascii_lowercase();
    if expected.len() != 64 || !expected.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err(DevToolboxError::Integrity(
            "expected sha256 must be 64 hex characters".to_string(),
        ));
    }
    let actual = sha256_hex(bytes);
    if actual == expected {
        Ok(())
    } else {
        Err(DevToolboxError::Integrity(format!(
            "sha256 mismatch (expected {expected}, got {actual})"
        )))
    }
}

/// Short, human-readable identifier for an Ed25519 public key.
///
/// It is the first 16 hex characters of `sha256(public_key_bytes)`, which is
/// what registry `keyId` fields and the plugin signing docs use.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KeyId(String);

impl KeyId {
    pub fn from_public_key_base64(public_key_b64: &str) -> Result<Self, DevToolboxError> {
        let bytes = decode_public_key(public_key_b64)?;
        let digest = sha256_hex(&bytes);
        Ok(Self(digest[..16].to_string()))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Display for KeyId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

/// Verify a detached Ed25519 signature over `payload`.
///
/// `public_key_b64` and `signature_b64` use standard Base64 with padding, the
/// format emitted by the `devtoolbox-market` signing helpers and documented in
/// `docs/plugin-dev/packaging.md`.
pub fn verify_detached_signature(
    public_key_b64: &str,
    payload: &[u8],
    signature_b64: &str,
) -> Result<(), DevToolboxError> {
    let key_bytes = decode_public_key(public_key_b64)?;
    let key_array: [u8; 32] = key_bytes.as_slice().try_into().map_err(|_| {
        DevToolboxError::Signature("Ed25519 public key must be 32 bytes".to_string())
    })?;
    let verifying_key = VerifyingKey::from_bytes(&key_array)
        .map_err(|err| DevToolboxError::Signature(format!("invalid public key: {err}")))?;

    let signature_bytes = STANDARD.decode(signature_b64.trim()).map_err(|err| {
        DevToolboxError::Signature(format!("signature is not valid Base64: {err}"))
    })?;
    let signature_array: [u8; 64] = signature_bytes.as_slice().try_into().map_err(|_| {
        DevToolboxError::Signature("Ed25519 signature must be 64 bytes".to_string())
    })?;
    let signature = Signature::from_bytes(&signature_array);

    verifying_key
        .verify_strict(payload, &signature)
        .map_err(|_| DevToolboxError::Signature("signature does not match payload".to_string()))
}

fn decode_public_key(public_key_b64: &str) -> Result<Vec<u8>, DevToolboxError> {
    STANDARD
        .decode(public_key_b64.trim())
        .map_err(|err| DevToolboxError::Signature(format!("public key is not valid Base64: {err}")))
}

/// Base64-encode bytes (used by the signing CLI and tests).
pub fn encode_base64(bytes: &[u8]) -> String {
    STANDARD.encode(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};

    fn keypair() -> (SigningKey, String) {
        let signing_key = SigningKey::from_bytes(&[42u8; 32]);
        let public_key = encode_base64(signing_key.verifying_key().as_bytes());
        (signing_key, public_key)
    }

    #[test]
    fn sha256_matches_known_vector() {
        assert_eq!(
            sha256_hex(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn verify_sha256_rejects_mismatch() {
        let digest = sha256_hex(b"package");
        assert!(verify_sha256(b"package", &digest).is_ok());
        assert!(verify_sha256(b"tampered", &digest).is_err());
    }

    #[test]
    fn verify_sha256_rejects_malformed_digest() {
        assert!(verify_sha256(b"x", "abc").is_err());
        assert!(verify_sha256(b"x", &"z".repeat(64)).is_err());
    }

    #[test]
    fn detached_signature_round_trip() {
        let (signing_key, public_key) = keypair();
        let payload = b"registry bytes";
        let signature = encode_base64(&signing_key.sign(payload).to_bytes());
        verify_detached_signature(&public_key, payload, &signature).unwrap();
    }

    #[test]
    fn detached_signature_rejects_tampering() {
        let (signing_key, public_key) = keypair();
        let signature = encode_base64(&signing_key.sign(b"original").to_bytes());
        let err = verify_detached_signature(&public_key, b"modified", &signature).unwrap_err();
        assert_eq!(err.code(), "signature_invalid");
    }

    #[test]
    fn key_id_is_short_and_stable() {
        let (_, public_key) = keypair();
        let id = KeyId::from_public_key_base64(&public_key).unwrap();
        assert_eq!(id.as_str().len(), 16);
        assert_eq!(id, KeyId::from_public_key_base64(&public_key).unwrap());
    }
}
