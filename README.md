# Dog Fight War — 3D web + Android

Two games in one:

* **WAR** – fighter jets (F-15E, MiG-29, MiG-35, F-15C). Take off from a real airport, dogfight waves of enemy jets, land again.
* **AIRLINE** – Airbus A318 with passengers. Pick a departure and a destination anywhere (Kochi → Dubai, London, New York …), board
  passengers, take off, press the autopilot (U) above 6000 ft to cruise (time-compressed), then land at the destination.
  Passenger comfort (g-forces, bank, stalls, hard landing) decides your revenue. Cabin view and window-seat view included.

Common: real-airport runways, 3D airport buildings (terminal, tower, apron, parked jets), real 3D city tiles (with a key),
clouds, cinematic take-off / landing camera (button 🎬 or key L), phone touch controls and phone-tilt steering.

```
web/       Vite + three.js game (physics, AI, HUD, lobby)
android/   WebView wrapper (APK)
.github/   GitHub Actions: builds the APK automatically
```

## 1. Real 3D buildings (pick ONE)
Without a key the game works with offline demo terrain (hills and fields) – no real buildings.

**A. Cesium ion token – free, no credit card (personal / non-commercial use, small monthly tile quota)**
1. Make a free account at <https://ion.cesium.com>.
2. *Asset Depot* → search **Google Photorealistic 3D Tiles** → **Add to my assets**.
3. *Access Tokens* → copy the default token.
4. Either paste it in the game: Lobby → Graphics → *Cesium ion token* → Apply,
   or add it as a GitHub secret named `CESIUM_ION_TOKEN` so it is built into the APK.

**B. Google Maps Tiles API key** (billing account required, free monthly credit)
1. Google Cloud Console → new project → enable **Map Tiles API** → Credentials → create API key (restrict it to Map Tiles API).
2. Paste in Lobby → Graphics → *Google Maps Tiles API key*, or add the secret `GOOGLE_MAPS_API_KEY`.

Attribution (Google / Cesium) is shown in the game as required by their terms.

## 2. Get the APK
1. Put this repo on GitHub. Actions tab → **Build Android APK** → Run workflow (it also runs on every push).
2. Open the finished run → **Artifacts → DogFightWar-apk** → install the `.apk` on your phone.

## 3. Run on PC
```
cd web
npm install
echo VITE_CESIUM_ION_TOKEN=your_token > .env     # or VITE_GOOGLE_MAPS_API_KEY=...
npm run dev
```
`npm test` runs the flight-physics tests.

## Controls
Keyboard: arrows pitch/roll, A/D rudder, W/S or Shift/Ctrl throttle, Space gun, M missile, X flares, G gear, F flaps, B brakes,
V airbrake, C camera (chase / cockpit / far, airliner: cabin / window seat), L cinematic camera, U airliner autopilot (press again to skip to approach),
T target view, N next target, H HUD, Y re-centre phone tilt, P/Esc pause. Mouse or finger drag = look around.
Touch: left stick, right throttle slider and buttons. Lobby → Controls → *Tilt steering* flies by tilting the phone.

## Airport alignment
Map tiles are not perfectly aligned with the virtual runway everywhere. Lobby → Departure has along / sideways / heading / ground
sliders; they are saved per airport.

## Troubleshooting
* Flat green ground: no key or tiles failed → check the status chip in Lobby → Graphics.
* Low FPS on phone: Lobby → Graphics → resolution Auto, Map detail Low.
* Build failing: open the failed step in the Actions log.
