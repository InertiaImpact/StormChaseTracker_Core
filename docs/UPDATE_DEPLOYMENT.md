# Update Deployment Notes for LLM Agents

This repo uses a simple first-party update publisher in StormChaseTracker Core. Core serves update metadata from its configured versions directory; Edge and other clients manually check that Core endpoint and only install after the operator confirms.

## Version Source of Truth

- Keep each Electron app's `package.json` version aligned for a coordinated release.
- Also update the matching root entry in each `package-lock.json`.
- Core reports its version with `app.getVersion()`.
- Edge compares its local `app.getVersion()` against the newest published Edge/Sender artifact in Core's manifest.

Current package roots:

- Core: repo root
- Edge/Sender: `edge/StormChaseTracker_Edge`
- Client: sibling project `../StormChaseTracker_Client`

## Build Artifacts

Build installers before publishing. The expected release artifacts are Windows installer files such as `.exe` or `.msi`; `.zip` is also accepted by the manifest scanner.

The Core update publisher discovers files by filename. Each published file must:

- Be placed directly in Core's configured versions directory.
- Have extension `.exe`, `.msi`, or `.zip`.
- Include one app identity token in the filename:
  - `core` or `server` for Core
  - `edge` for Edge
  - `client` for Client
- Include a semantic version like `0.3.0`.

Good examples:

- `StormChaseTracker-Core-Setup-0.3.0.exe`
- `StormChaseTracker-Edge-Setup-0.3.0.exe`
- `StormChaseTracker-Client-Setup-0.3.0.exe`

Avoid generic names like `Setup.exe`; the server will ignore them because it cannot infer the app or version.

## Publishing to the Server

1. Start StormChaseTracker Core on the server machine.
2. Open Core settings and review `Version Publishing` -> `Versions Directory`.
3. Leave the path blank to use the default Electron `userData/versions` folder, or set it to a custom folder/share path such as:

   ```text
   \\KGAN-VLINK\updaterVersions
   ```

4. Save settings, then use `Version Publishing` -> `Open Versions Directory`.
5. Copy the new installer files into that directory.
6. Verify the server manifest from a browser or client machine:

   ```text
   http://SERVER-IP/api/updates/manifest
   ```

7. Confirm that the relevant app bucket has the expected `latest.version` and a `downloadUrl`.

The manifest is generated dynamically from the directory contents. No separate manifest file needs to be edited.

## Client/Edge Update Flow

Edge and clients do not auto-install updates.

1. In the Edge/client UI, leave `Update Server` blank to auto-detect the server from the existing connection:
   - Edge derives it from the saved send target URL.
   - Client derives it from the saved Core API URL.

   Set `Update Server` only when you need to override that detected base URL, for example:

   ```text
   http://10.215.100.169
   ```

2. Save settings.
3. Click `Check for Update`.
4. If a newer version is found, click `Confirm Update`.

The app downloads the installer to its local pending-update directory, verifies the SHA-256 from Core's manifest, launches the installer, and quits.

## Safety Notes

- Publish only trusted installers because clients launch the downloaded file after manual confirmation.
- If multiple installers for the same app exist, Core picks the highest semantic version as `latest`.
- If two files have the same version, Core picks the newest modified file.
- Core only serves files inside its versions directory and strips path traversal from download requests.
