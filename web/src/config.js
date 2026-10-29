// Aircraft specs (SI units). Physics numbers follow the original Kotlin AircraftConfig fields,
// re-tuned for the real aircraft in the GLB models.
// noseAxis: which model axis the nose points to (found by analysing the GLB files).

export const KT = 0.514444;       // m/s per knot
export const FT = 0.3048;         // m per foot
export const FPM = 0.00508;       // m/s per ft/min

export const AIRCRAFT = {
  f15e: {
    id: 'f15e',
    name: 'F-15E Strike Eagle',
    blurb: 'Twin-engine heavy fighter. Powerful, stable, 9 G.',
    model: 'models/f15e.glb', noseAxis: '+x', lengthM: 19.4, gearHeight: 2.1,
    nose: -6.0, main: 1.0, track: 3.0,
    massKg: 23500, fuelKg: 5000, thrustMil: 158000, thrustAB: 258000, hasAB: true,
    wingArea: 56.5, span: 13.05, chord: 4.5, cL0: 0.05, cLMax: 1.75, stallDeg: 22,
    cD0: 0.022, kInd: 0.075, rotateKt: 145, approachKt: 150, sinkLimitFpm: 1100,
    pitchRate: 1.4, rollRate: 3.4, yawRate: 0.5, ctrlTau: 0.25, maxG: 9, minG: -3,
    weapons: true, color: '#7fb0ff', cat: 'war',
  },
  mig29: {
    id: 'mig29',
    name: 'MiG-29 Fulcrum',
    blurb: 'Agile, high angle-of-attack, great at close dogfights.',
    model: 'models/mig29.glb', noseAxis: '+x', lengthM: 17.4, gearHeight: 2.0,
    nose: -5.2, main: 0.9, track: 3.1,
    massKg: 15300, fuelKg: 3500, thrustMil: 101000, thrustAB: 163000, hasAB: true,
    wingArea: 38.0, span: 11.36, chord: 3.8, cL0: 0.06, cLMax: 1.8, stallDeg: 24,
    cD0: 0.021, kInd: 0.075, rotateKt: 135, approachKt: 145, sinkLimitFpm: 1100,
    pitchRate: 1.6, rollRate: 4.2, yawRate: 0.6, ctrlTau: 0.2, maxG: 9, minG: -3,
    weapons: true, color: '#ff8a5c', cat: 'war',
  },
  mig35: {
    id: 'mig35',
    name: 'MiG-35 Fulcrum-F',
    blurb: 'Modern MiG with stronger engines and better handling.',
    model: 'models/mig35.glb', noseAxis: '+x', lengthM: 17.6, gearHeight: 2.0,
    nose: -5.3, main: 0.9, track: 3.1,
    massKg: 16800, fuelKg: 4500, thrustMil: 106000, thrustAB: 176000, hasAB: true,
    wingArea: 38.0, span: 12.0, chord: 3.8, cL0: 0.06, cLMax: 1.85, stallDeg: 24,
    cD0: 0.020, kInd: 0.07, rotateKt: 135, approachKt: 145, sinkLimitFpm: 1100,
    pitchRate: 1.7, rollRate: 4.5, yawRate: 0.6, ctrlTau: 0.18, maxG: 9, minG: -3,
    weapons: true, color: '#ffd45c', cat: 'war',
  },
  eagle: {
    id: 'eagle',
    name: 'F-15C Eagle',
    blurb: 'Lighter air-superiority Eagle. Fast climb, sharp turns.',
    model: 'models/eagle.glb', noseAxis: '-z', lengthM: 19.4, gearHeight: 2.1,
    nose: -6.0, main: 1.0, track: 3.0,
    massKg: 20200, fuelKg: 4800, thrustMil: 158000, thrustAB: 258000, hasAB: true,
    wingArea: 56.5, span: 13.05, chord: 4.5, cL0: 0.05, cLMax: 1.75, stallDeg: 22,
    cD0: 0.021, kInd: 0.072, rotateKt: 135, approachKt: 145, sinkLimitFpm: 1100,
    pitchRate: 1.5, rollRate: 3.6, yawRate: 0.5, ctrlTau: 0.22, maxG: 9, minG: -3,
    weapons: true, color: '#9be37a', cat: 'war',
  },
  a318: {
    id: 'a318',
    name: 'Airbus A318',
    blurb: 'Passenger jet, 112 seats. Smooth take-off, long-haul cruise and a gentle landing.',
    model: 'models/a318.glb', noseAxis: '+z', lengthM: 31.45, gearHeight: 3.9,
    nose: -9.0, main: 1.5, track: 8.9,
    massKg: 52000, fuelKg: 9000, thrustMil: 210000, thrustAB: 210000, hasAB: false,
    wingArea: 122.6, span: 34.1, chord: 4.3, cL0: 0.2, cLMax: 1.7, stallDeg: 15,
    cD0: 0.026, kInd: 0.045, rotateKt: 140, approachKt: 135, sinkLimitFpm: 700,
    pitchRate: 0.22, rollRate: 0.7, yawRate: 0.18, ctrlTau: 1.1, maxG: 2.5, minG: -1,
    weapons: false, color: '#ffffff', flapsLift: 0.7, cat: 'airline', seats: 112, cruiseKmh: 830, cruiseAltM: 10670,
  },
};

export const AIRCRAFT_LIST = ['f15e', 'mig29', 'mig35', 'eagle', 'a318'];
export const WAR_LIST = ['f15e', 'mig29', 'mig35', 'eagle'];
export const AIRLINE_LIST = ['a318'];
export const ENEMY_TYPES = ['mig29', 'mig35'];

// Airports (runway reference point, field elevation, runway true heading, runway length).
// Single virtual runway per preset: the values below are representative and must be verified in-game.
// Exact threshold coordinates and parallel-runway selection will be refined in a later alignment pass.
export const AIRPORTS = [
  // India
  { icao: 'VOCI', iata: 'COK', name: 'Cochin International', city: 'Kochi', country: 'India', lat: 10.15112, lon: 76.40051, elev: 9, hdg: 87.64, len: 3400 },
  { icao: 'VOTV', iata: 'TRV', name: 'Trivandrum International', city: 'Thiruvananthapuram', country: 'India', lat: 8.4821, lon: 76.9201, elev: 5, hdg: 138, len: 3400 },
  { icao: 'VOCL', iata: 'CCJ', name: 'Calicut International', city: 'Kozhikode', country: 'India', lat: 11.1368, lon: 75.9553, elev: 104, hdg: 100, len: 2860 },
  { icao: 'VOKN', iata: 'CNN', name: 'Kannur International', city: 'Kannur', country: 'India', lat: 11.9186, lon: 75.5472, elev: 104, hdg: 70, len: 3050 },
  { icao: 'VABB', iata: 'BOM', name: 'Chhatrapati Shivaji', city: 'Mumbai', country: 'India', lat: 19.0887, lon: 72.8679, elev: 11, hdg: 90, len: 3445 },
  { icao: 'VIDP', iata: 'DEL', name: 'Indira Gandhi International', city: 'Delhi', country: 'India', lat: 28.5562, lon: 77.1000, elev: 237, hdg: 110, len: 4430 },
  { icao: 'VOBL', iata: 'BLR', name: 'Kempegowda International', city: 'Bengaluru', country: 'India', lat: 13.1986, lon: 77.7066, elev: 915, hdg: 90, len: 4000 },
  { icao: 'VOMM', iata: 'MAA', name: 'Chennai International', city: 'Chennai', country: 'India', lat: 12.9941, lon: 80.1709, elev: 16, hdg: 70, len: 3658 },
  { icao: 'VOHS', iata: 'HYD', name: 'Rajiv Gandhi International', city: 'Hyderabad', country: 'India', lat: 17.2403, lon: 78.4294, elev: 617, hdg: 90, len: 4260 },

  // Pakistan
  { icao: 'OPLA', iata: 'LHE', name: 'Allama Iqbal International', city: 'Lahore', country: 'Pakistan', lat: 31.52155, lon: 74.40455, elev: 217, hdg: 181, len: 3360 },
  { icao: 'OPIS', iata: 'ISB', name: 'Islamabad International', city: 'Islamabad', country: 'Pakistan', lat: 33.54815, lon: 72.82544, elev: 537, hdg: 100.35, len: 3658 },
  { icao: 'OPKC', iata: 'KHI', name: 'Jinnah International', city: 'Karachi', country: 'Pakistan', lat: 24.90667, lon: 67.16083, elev: 31, hdg: 75, len: 3500 },

  // Afghanistan — Kabul RWY 11/29 midpoint estimated from published threshold coordinates; true heading about 104°.
  { icao: 'OAKB', iata: 'KBL', name: 'Kabul International', city: 'Kabul', country: 'Afghanistan', lat: 34.5658, lon: 69.2125, elev: 1791, hdg: 104, len: 3500 },
  { icao: 'OAKN', iata: 'KDH', name: 'Ahmad Shah Baba International', city: 'Kandahar', country: 'Afghanistan', lat: 31.5058, lon: 65.8478, elev: 1010, hdg: 50, len: 3200 },

  // China — Beijing runway 01/19 midpoint derived from published runway-end coordinates.
  { icao: 'ZBAA', iata: 'PEK', name: 'Beijing Capital International', city: 'Beijing', country: 'China', lat: 40.075874, lon: 116.614948, elev: 28, hdg: 353, len: 3800 },
  // Shanghai Pudong runway 17L/35R approximate midpoint from published runway-end coordinates.
  { icao: 'ZSPD', iata: 'PVG', name: 'Shanghai Pudong International', city: 'Shanghai', country: 'China', lat: 31.1450, lon: 121.7933, elev: 4, hdg: 168, len: 4000 },

  // Other international airports
  { icao: 'OMDB', iata: 'DXB', name: 'Dubai International', city: 'Dubai', country: 'UAE', lat: 25.2532, lon: 55.3657, elev: 19, hdg: 120, len: 4000 },
  { icao: 'EGLL', iata: 'LHR', name: 'London Heathrow', city: 'London', country: 'UK', lat: 51.4700, lon: -0.4543, elev: 25, hdg: 270, len: 3902 },
  { icao: 'KJFK', iata: 'JFK', name: 'John F. Kennedy', city: 'New York', country: 'USA', lat: 40.63818, lon: -73.79425, elev: 4, hdg: 121, len: 4423 },
  { icao: 'KLAX', iata: 'LAX', name: 'Los Angeles International', city: 'Los Angeles', country: 'USA', lat: 33.9416, lon: -118.4085, elev: 38, hdg: 250, len: 3685 },
  { icao: 'KSFO', iata: 'SFO', name: 'San Francisco International', city: 'San Francisco', country: 'USA', lat: 37.6213, lon: -122.3790, elev: 4, hdg: 280, len: 3618 },
  { icao: 'RJTT', iata: 'HND', name: 'Tokyo Haneda', city: 'Tokyo', country: 'Japan', lat: 35.5494, lon: 139.7798, elev: 6, hdg: 160, len: 3360 },
  { icao: 'WSSS', iata: 'SIN', name: 'Singapore Changi', city: 'Singapore', country: 'Singapore', lat: 1.3644, lon: 103.9915, elev: 7, hdg: 20, len: 4000 },
  { icao: 'YSSY', iata: 'SYD', name: 'Sydney Kingsford Smith', city: 'Sydney', country: 'Australia', lat: -33.9399, lon: 151.1753, elev: 6, hdg: 160, len: 3962 },
  { icao: 'LFPG', iata: 'CDG', name: 'Paris Charles de Gaulle', city: 'Paris', country: 'France', lat: 49.0097, lon: 2.5479, elev: 119, hdg: 85, len: 4215 },
  { icao: 'OTHH', iata: 'DOH', name: 'Hamad International', city: 'Doha', country: 'Qatar', lat: 25.2731, lon: 51.6081, elev: 4, hdg: 160, len: 4850 },
  { icao: 'OMAA', iata: 'AUH', name: 'Zayed International', city: 'Abu Dhabi', country: 'UAE', lat: 24.4330, lon: 54.6511, elev: 27, hdg: 130, len: 4100 },
  { icao: 'EDDF', iata: 'FRA', name: 'Frankfurt Airport', city: 'Frankfurt', country: 'Germany', lat: 50.0379, lon: 8.5622, elev: 111, hdg: 70, len: 4000 },
  { icao: 'EHAM', iata: 'AMS', name: 'Amsterdam Schiphol', city: 'Amsterdam', country: 'Netherlands', lat: 52.3105, lon: 4.7683, elev: -3, hdg: 184, len: 3800 },
  { icao: 'KATL', iata: 'ATL', name: 'Hartsfield-Jackson Atlanta', city: 'Atlanta', country: 'USA', lat: 33.6407, lon: -84.4277, elev: 313, hdg: 90, len: 3048 },
];

// Difficulty presets for enemy AI
export const DIFFICULTY = {
  easy: { name: 'Easy', turnG: 4.5, fireGap: 18, gunAcc: 0.35, hp: 70, speed: 0.8, flare: 0.1 },
  normal: { name: 'Normal', turnG: 6.0, fireGap: 12, gunAcc: 0.55, hp: 100, speed: 0.95, flare: 0.3 },
  ace: { name: 'Ace', turnG: 7.5, fireGap: 7, gunAcc: 0.8, hp: 130, speed: 1.05, flare: 0.5 },
};

// Render-height presets. 'auto' dynamically scales to maintain playable frame rate.
// 4K is an optional output target; device/GPU limits and adaptive scaling still apply.
export const RESOLUTIONS = [
  { id: 'auto', name: 'Auto', h: 900 },
  { id: '540', name: '540p', h: 540 },
  { id: '720', name: '720p', h: 720 },
  { id: '1080', name: '1080p', h: 1080 },
  { id: '1440', name: '1440p', h: 1440 },
  { id: '2160', name: '4K', h: 2160 },
];

// 3D tile detail: lower screen-space-error = sharper (and heavier)
export const TILE_QUALITY = [
  { id: 'low', name: 'Low', sse: 48 },
  { id: 'med', name: 'Medium', sse: 24 },
  { id: 'high', name: 'High', sse: 12 },
  { id: 'ultra', name: 'Ultra', sse: 6 },
];

export const TIMES = [
  { id: 'morning', name: 'Morning', sun: [-0.55, 0.38, -0.2], sky: ['#6fa8dc', '#cfe4f3', '#f6d9b0'], fog: '#cbd9e6', sunI: 2.2, hemi: 0.9 },
  { id: 'noon', name: 'Noon', sun: [0.2, 0.95, 0.1], sky: ['#2f78c8', '#8fc0ec', '#d8ecfa'], fog: '#c9def0', sunI: 3.0, hemi: 1.0 },
  { id: 'sunset', name: 'Sunset', sun: [0.7, 0.16, -0.3], sky: ['#35508a', '#d98b6a', '#ffd29a'], fog: '#e2b895', sunI: 2.0, hemi: 0.7 },
];
