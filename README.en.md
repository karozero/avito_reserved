# Avito Reserved Marker

Highlights reserved Avito listings with an orange frame and badge.

## Install

- **GitHub Releases:** download the [latest release](https://github.com/karozero/avito_reserved/releases/latest), extract it, open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select the extracted folder.
- **Chrome Web Store:** not published yet. The listing link will be added after publication.

## Build

Requires Node.js. Run from the project root:

```sh
npm ci
npm run build
npm test
npm run package
```

The extension build is written to `dist/`. The store upload archive is `avito-reserved-marker.zip`.
