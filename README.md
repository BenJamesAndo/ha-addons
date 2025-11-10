# Home Assistant Add-ons

![Project Stage][project-stage-shield]
![Maintenance][maintenance-shield]
[![License][license-shield]](LICENSE)

## About

This repository contains custom Home Assistant add-ons.

## Installation

Adding this add-ons repository to your Home Assistant instance is simple:

1. Navigate to **Settings** → **Add-ons** → **Add-on Store**
2. Click the **⋮** menu in the top right and select **Repositories**
3. Add this repository URL:
   ```
   https://github.com/BenJamesAndo/hassio-addons
   ```
4. Click **Add** → **Close**
5. The add-ons will now appear in your add-on store

## Add-ons

This repository contains the following add-ons:

### [ProWebRemote with Ingress Support](./prowebremote)

![Supports aarch64 Architecture][aarch64-shield]
![Supports amd64 Architecture][amd64-shield]
![Supports armhf Architecture][armhf-shield]
![Supports armv7 Architecture][armv7-shield]
![Supports i386 Architecture][i386-shield]

Access ProPresenter's WebSocket API securely over HTTPS through Home Assistant's ingress system.

**Features:**
- 🔒 HTTPS support for ProPresenter's WebSocket API
- 🌐 Secure remote access from anywhere
- ⚙️ Configurable user preferences
- 📱 Sidebar integration

## Support

Got questions or need help?

- Open an issue on [GitHub](https://github.com/BenJamesAndo/hassio-addons/issues)
- Check the [ProPresenter Integration](https://github.com/BenJamesAndo/ha-propresenter)

## Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

## License

MIT License - see [LICENSE](LICENSE) file for details

---

[aarch64-shield]: https://img.shields.io/badge/aarch64-yes-green.svg
[amd64-shield]: https://img.shields.io/badge/amd64-yes-green.svg
[armhf-shield]: https://img.shields.io/badge/armhf-yes-green.svg
[armv7-shield]: https://img.shields.io/badge/armv7-yes-green.svg
[i386-shield]: https://img.shields.io/badge/i386-yes-green.svg
[license-shield]: https://img.shields.io/github/license/BenJamesAndo/hassio-addons.svg
[maintenance-shield]: https://img.shields.io/maintenance/yes/2025.svg
[project-stage-shield]: https://img.shields.io/badge/project%20stage-production%20ready-brightgreen.svg
