# Unicode

Unicode, officially The Unicode Standard, is an information technology standard for the consistent encoding, representation, and handling of text expressed in most of the world's writing systems.

Unicode provides a unique number for every character, no matter what platform, device, application, or language. It has been adopted by all modern software providers and now allows data to be transported through many different platforms, devices, and applications without corruption.

## Origin and Development

Unicode was conceived as a solution to the limitations of existing character encoding schemes. Before Unicode, there were hundreds of different encoding systems for assigning numbers to characters. No single encoding could contain enough characters.

The Unicode project began in the late 1980s. In 1991, the Unicode Consortium was established to develop and promote the Unicode Standard.

## Key Versions

- Unicode 1.0 (1991): First release, 7,161 characters
- Unicode 3.0 (1999): 49,259 characters
- Unicode 6.0 (2010): Added Emoji
- Unicode 13.0 (2020): 143,924 characters
- Unicode 15.0 (2022): 149,186 characters

## Encoding and Implementation

### Design Principles

The Unicode Standard defines ten key design principles:

- **Universality**: A single, comprehensive character set
- **Efficiency**: Easy to process and parse
- **Characters, not glyphs**: Characters, not visual representations
- **Semantics**: Well-defined character semantics
- **Plain text**: Limited to text characters
- **Logical order**: Default memory representation is logical order
- **Unification**: Unify duplicate characters across scripts
- **Dynamic composition**: Combining marks can be dynamically composed
- **Stability**: Assigned characters and semantics never change
- **Convertibility**: Precise conversion with other character sets

### Encoding Forms

Common UTF encodings:

- **UTF-8**: Variable-length (1-4 bytes), ASCII-compatible, most common on the web
- **UTF-16**: Variable-length (2 or 4 bytes), used internally by Windows and Java
- **UTF-32**: Fixed-length (4 bytes), simple but space-intensive

### Character Planes

Unicode divides its codespace into 17 planes (0-16). Plane 0 (Basic Multilingual Plane, BMP) contains the most commonly used characters.

## Input Methods

- **Linux**: Ctrl+Shift+U, then type the Unicode hex value
- **Windows**: Hold Alt, type 0 + decimal Unicode code on numpad
- **macOS**: Enable Unicode Hex Input, hold Option and type the code point
