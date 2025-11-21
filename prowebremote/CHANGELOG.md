# ProWebRemote Addon Changelog

## Version 2.0 - OpenAPI Support

### New Features

- **OpenAPI v1 Support**: Full implementation of ProPresenter 7's OpenAPI v1 REST API
  - Real-time status streaming for instant UI updates
  - Slide image thumbnails loaded directly from API
  - Support for playlist folders and nested structures
  - Audio playback controls with track information
  - Message timer controls
  - Clear layer commands (slide, audio, messages, props, announcements, media, all)
  
- **Dual API Mode**: Choose between Classic WebSocket or OpenAPI
  - Both APIs fully supported through ingress proxy
  - Seamless switching without code changes

### Configuration

New addon options:

```yaml
api_type: "classic"  # or "open" for OpenAPI v1
```

---

## Version 1.1 - Initial Ingress Support

- Basic ingress proxy support for Classic WebSocket API
- Configuration via Home Assistant addon options
