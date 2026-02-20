# StormChaseTracker Debug

Small Electron utility for GPS/NMEA testing.

## Features
- Select GPS source type: `UDP`, `TCP`, `Dummy Route`, `Dummy Static`
- Save source configuration
- Start/stop listening without running full Edge app
- View detailed live diagnostics:
  - bind address and socket errors
  - last source/packet time
  - packet and byte counts
  - raw last NMEA sentence
  - decoded GPS fields (`RMC`, `GGA`, `GNS`, `VTG`)

## Run
1. `npm install`
2. `npm start`

## Build installer
- `npm run dist`

Built artifacts are written to the `dist` folder.
