## URL Encoding/Decoding

A Uniform Resource Locator (URL), commonly known as a web address, is a standard address for resources on the Internet — like a street address on the network. It was originally invented by Tim Berners-Lee for use as addresses on the World Wide Web and has since been standardized by the World Wide Web Consortium as Internet standard RFC 1738.

The invention of the URL was a fundamental step in the history of the Internet. URL syntax is general and extensible, using a subset of ASCII codes to represent Internet addresses. The beginning of a URL typically indicates the network protocol used by a computer network.

## Syntax

A URL for the Hypertext Transfer Protocol includes five basic elements for retrieving information from the Internet in a simple address:

1. Transfer protocol
2. Hierarchical URL marker ("//", fixed)
3. Credentials for accessing the resource (optional)
4. Server (usually a domain name, sometimes an IP address)
5. Port number (numeric, can be omitted if default)
6. Path (directories separated by "/" characters)
7. Query (GET form parameters, starting with "?", each parameter separated by "&", name and value separated by "=", typically URL-encoded in UTF-8 to avoid character conflicts)
8. Fragment (starting with "#")

The standard URL format is:

```
[protocol]://[server]:[port]/[path][filename]?[query]#[fragment]
```

The complete URL format is:

```
[protocol]://[credentials]@[server]:[port]/[path][filename]?[query]#[fragment]
```

The [credentials], [port], [query], and [fragment] are all optional.

## Example

Taking `https://en.wikipedia.org:443/w/index.php?title=Special:Random` as an example:

1. **https** — the protocol
2. **en.wikipedia.org** — the server
3. **443** — the port number
4. **/w/index.php** — the path
5. **?title=Special:Random** — the query

Most web browsers do not require users to type "https://" since the majority of web content uses the Hypertext Transfer Protocol. Similarly, "443" is the default port for HTTPS (while "80" is the default for HTTP), so it is usually omitted. Users typically only need to type part of the URL (e.g., `en.wikipedia.org/w/index.php?title=Special:Random`).

Since HTTP allows servers to redirect browsers to another address, many servers allow users to omit parts of the URL, such as "www". Technically, the shortened address is actually a different URL — the browser cannot determine on its own whether the new address is valid, so the server must handle the redirection.

## Other Uses

URLs are not only used as web addresses. JDBC clients also use URLs to connect to database servers. In contrast, ODBC connectors use a different format — key-value pairs separated by semicolons and equals signs rather than the URL format.

Here is an example of an Oracle database URL:

```
jdbc:datadirect:oracle://myserver:1521;sid=testdb
```
