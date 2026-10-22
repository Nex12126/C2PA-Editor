# Nex's Meta Editor

A local-first Windows desktop app for inspecting and editing image metadata, including C2PA Content Credentials.

Created by **Nex12126**. The Swarm robot artwork was supplied by Nex12126 and is used for the app logo and Windows icon.

## Features

- Inspect EXIF, IPTC, XMP, GPS, and embedded C2PA data.
- Edit image description, creator, copyright, and capture time in JPEG files.
- Export a separate copy with metadata removed. The app explains that this also removes C2PA provenance and may re-encode the image; the original is never changed.
- Process images locally. The app does not upload images or include telemetry.

The C2PA manifest is read-only because editing signed provenance can invalidate its signature. Publisher trust is not verified by this app.

## Development

Requirements: Node.js 22 or later and npm.

```sh
npm install
npm run dev
```

## Build for Windows

Create a portable x64 executable:

```sh
npm run build:win
```

The executable is written to `artifacts/Nexs-Meta-Editor-0.1.0-portable.exe`. The Windows icon is generated from the optimized Swarm artwork as part of this command.

## License

MIT. See [LICENSE](LICENSE).