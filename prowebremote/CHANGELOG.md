# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2025-11-11

### Added
- Initial release of ProWebRemote with Ingress Support
- HTTPS support for ProPresenter's WebSocket API through HA ingress
- Configurable user preferences (authentication, playlists, etc.)
- Home Assistant sidebar integration
- Automatic JavaScript patching for ingress path support
- Support for all major architectures (amd64, aarch64, armhf, armv7, i386)

### Features
- Secure remote access to ProPresenter over HTTPS
- No mixed content issues when accessing HA over SSL
- User-friendly configuration options with descriptions
- Runtime installation of nginx for maximum compatibility
- Disabled JavaScript caching to ensure preference changes take effect
