# Dog Fight War — 3D web + Android

Realistic 3D dogfight game: take off and land at real airports, fight AI enemies in full 3D,
fly over Google Photorealistic 3D Tiles (real buildings), clouds, aircraft lobby using the GLB
jets from `fighter-jets`.

```
web/       Vite + three.js game (physics, AI, HUD, lobby)
android/   WebView wrapper (APK)
.github/   GitHub Actions: builds the APK automatically
```

## 1. Google Maps key (for real 3D buildings)
1. Google Cloud Console -> create project -> enable **Map Tiles API** -> create an API key.
2. GitHub repo -> Settings -> Secrets and variables -> Actions -> **New repository secret**
   `GOOGLE_MAPS_API_KEY` = your key. The APK then has the key built in.
3. Or skip it: paste the key in the game's Lobby -> Graphics tab. Without any key the game uses
   procedural terrain (still fully playable).

Restrict the key to the Map Tiles API. Google attribution is shown in-game (required by Google's terms).

## 2. Get the APK
1. Push this repo to GitHub (replace the old `Dog-fight-war` contents with these folders).
2. Actions tab -> **Build Android APK** -> run (also runs on every push).
3. Open the finished run -> **Artifacts -> DogFightWar-apk** -> install the `.apk` on your phone.
   Tag `v1.0` (`git tag v1.0 && git push --tags`) to also get a GitHub Release.

## 3. Run on PC
```
cd web
npm install
echo VITE_GOOGLE_MAPS_API_KEY=your_key > .env
npm run dev
```
`npm test` runs the flight-physics tests.

## Controls
Keyboard: W/S pitch, A/D roll, Q/E rudder, Shift/Ctrl throttle, Space gun, M missile, F flares,
G gear, B airbrake, V flaps, T next target, C camera, P/Esc pause.
Gamepad and on-screen touch controls (stick, throttle slider, buttons) are supported.

## Airport alignment
Google tiles are not perfectly aligned with the virtual runway everywhere. Lobby -> Airport tab has
heading / offset / height fine-tune sliders; settings are saved per device.

## Troubleshooting
- Black/flat ground: key missing or Map Tiles API not enabled -> procedural terrain is used.
- Low FPS on phone: Lobby -> Graphics -> lower resolution / tile quality.
- Build failing: open the failed step in the Actions log.
