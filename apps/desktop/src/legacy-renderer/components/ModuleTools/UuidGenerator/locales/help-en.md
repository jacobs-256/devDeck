# UUID versions

- **NIL**: The all-zero UUID (`00000000-0000-0000-0000-000000000000`).
- **v1**: Time-based UUID (timestamp + clock sequence + node id). Unique but not deterministic.
- **v3**: Name-based UUID using **MD5**. Deterministic: same inputs produce the same UUID.
- **v4**: Random UUID. Best default for general-purpose unique ids.
- **v5**: Name-based UUID using **SHA-1**. Deterministic: same inputs produce the same UUID.

# Namespaces (v3 / v5)

RFC 4122 defines standard namespace UUIDs:

- **DNS**: Use when your name is a DNS name like `example.com`
- **URL**: Use when your name is a URL like `https://example.com/path`
- **OID**: Use when your name is an OID
- **X.500**: Use when your name is an X.500 DN

# Name and Namespace UUID

- **Name**: Any string input used to derive the UUID (for v3/v5).
- **Namespace UUID**: A UUID that scopes the name. The final UUID is derived from `(namespace UUID + name)`.
  - Changing the namespace UUID or the name will change the output UUID.
  - Using a custom namespace UUID lets you create your own deterministic UUID space.

