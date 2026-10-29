// Plain-Node physics smoke tests: take-off roll, climb, G-limit, stall recovery, landing.
import { FlightModel } from '../src/physics.js';
import { AIRCRAFT } from '../src/config.js';
import { V3 } from '../src/math.js';

const fmt = (x, n = 1) => Number(x).toFixed(n);
function run(model, seconds, ctl, log = 0) {
  const dt = 1 / 60; let t = 0, next = 0;
  while (t < seconds && !model.crashed) {
    ctl && ctl(model, t);
    model.update(dt); t += dt;
    if (log && t >= next) {
      const T = model.tele;
      console.log(`t=${fmt(t, 0).padStart(3)}s ${model.phase.padEnd(12)} spd=${fmt(T.speedKt, 0).padStart(4)}kt M${fmt(T.machNo, 2)} agl=${fmt(T.altAglFt, 0).padStart(6)}ft vs=${fmt(T.vsFpm, 0).padStart(6)} pit=${fmt(T.pitchDeg).padStart(5)} bank=${fmt(T.rollDeg, 0).padStart(4)} aoa=${fmt(T.aoaDeg).padStart(5)} nz=${fmt(T.nz, 2)} z=${fmt(model.pos.z, 0)}`);
      next += log;
    }
  }
  return t;
}
let fails = 0;
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) fails++; };

for (const id of ['f15e', 'mig29', 'a318']) {
  console.log(`\n===== ${id}: takeoff =====`);
  const m = new FlightModel(AIRCRAFT[id]);
  let rotated = false, liftoffT = -1, liftoffKt = 0;
  run(m, 70, (mm, t) => {
    mm.input.throttle = t > 1 ? 1 : 0;
    if (mm.tele.speedKt > AIRCRAFT[id].rotateKt) { mm.input.pitch = id === 'a318' ? 0.35 : 0.3; rotated = true; }
    if (!mm.onGround && mm.tele.pitchDeg > 15) mm.input.pitch = -0.1;
    if (liftoffT < 0 && !mm.onGround && mm.tele.speedKt > 50) { liftoffT = mm.t; liftoffKt = mm.tele.speedKt; }
    if (!mm.onGround && mm.tele.altAglFt > 100 && mm.gearDown) mm.toggleGear();
    if (!mm.onGround && mm.tele.altAglFt > 500) mm.input.pitch = 0;
  }, 5);
  ok(!m.crashed, `${id}: no crash during takeoff (${m.crashReason})`);
  ok(liftoffT > 0, `${id}: lifted off at t=${fmt(liftoffT)}s, ${fmt(liftoffKt, 0)}kt, roll ${fmt(0 - m.pos.z, 0)}m? (z=${fmt(m.pos.z, 0)})`);
  ok(m.tele.altAglFt > 300, `${id}: climbing (agl ${fmt(m.tele.altAglFt, 0)} ft)`);
}

console.log('\n===== f15e: manoeuvres (airborne) =====');
{
  const m = new FlightModel(AIRCRAFT.f15e); m.resetAirborne(5000, 450);
  console.log('-- stick neutral 20s (assist should hold level)');
  run(m, 20, (mm) => { mm.input.throttle = 0.8; }, 5);
  ok(Math.abs(m.tele.altAglFt - 5000 / 0.3048) < 3500 && !m.crashed, 'neutral stick holds roughly level');
  console.log('-- full pull 6s');
  run(m, 6, (mm) => { mm.input.pitch = 1; mm.input.throttle = 1; }, 1);
  ok(m.tele.nz > 4, `pulled ${fmt(m.tele.nz, 1)} g`);
  console.log('-- bank 70deg then pull');
  const m2 = new FlightModel(AIRCRAFT.f15e); m2.resetAirborne(8000, 450);
  run(m2, 12, (mm, t) => { mm.input.throttle = 0.9; mm.input.roll = t < 1 ? 1 : 0; if (mm.tele.rollDeg > 70) mm.input.roll = 0; }, 2);
  ok(!m2.crashed && Math.abs(m2.tele.rollDeg) > 40, `holds bank ${fmt(m2.tele.rollDeg, 0)} deg`);
  console.log('-- slow-speed stall: idle thrust pull-up');
  const m3 = new FlightModel(AIRCRAFT.f15e); m3.resetAirborne(6000, 300);
  run(m3, 40, (mm, t) => { mm.input.throttle = 0; mm.input.pitch = t < 25 ? 0.6 : 0; }, 4);
  ok(!m3.crashed, `stall test survived (${m3.crashReason}) alt ${fmt(m3.tele.altAglFt, 0)}ft speed ${fmt(m3.tele.speedKt, 0)}kt`);
  console.log('-- top speed test');
  const m4 = new FlightModel(AIRCRAFT.f15e); m4.resetAirborne(12000, 600); m4.fuelBurnScale = 0;
  run(m4, 150, (mm) => { mm.input.throttle = 1; mm.input.pitch = 0; }, 50);
  console.log(`   Mach at 40k ft AB: ${fmt(m4.tele.machNo, 2)}`);
  const m5 = new FlightModel(AIRCRAFT.f15e); m5.resetAirborne(500, 500); m5.fuelBurnScale = 0;
  run(m5, 60, (mm) => { mm.input.throttle = 1; mm.input.pitch = 0; }, 20);
  console.log(`   Mach at ~500 ft AB: ${fmt(m5.tele.machNo, 2)}`);
}

console.log('\n===== f15e: approach + landing =====');
{
  const m = new FlightModel(AIRCRAFT.f15e);
  m.pos.set(0, 160, 3200); m.vel.set(0, -4, -75); m.gearDown = true; m.gearPos = 1; m.flapsTarget = 1; m.flapsPos = 1;
  m.parkingBrake = false; m.onGround = false; m.wasOnGround = false; m.q = (await import('../src/math.js')).Q4.lookAlong(new V3(0, -0.04, -1));
  run(m, 120, (mm, t) => {
    const agl = mm.tele.altAglFt * 0.3048;
    const spd = mm.tele.speedKt;
    mm.input.throttle = spd > 155 ? 0.1 : spd < 145 ? 0.55 : 0.32;
    // glideslope: target sink proportional to agl
    const targetVs = agl > 12 ? -Math.min(4.0, agl * 0.05 + 0.4) : -0.5;
    const vs = mm.vel.y;
    mm.input.pitch = Math.max(-0.12, Math.min(0.12, (targetVs - vs) * 0.03));
    if (mm.onGround) { mm.input.throttle = 0; mm.wheelBrake = true; mm.setAirbrake(true); mm.input.pitch = 0; }
  }, 6);
  ok(!m.crashed, `landing: no crash (${m.crashReason}) -> ${m.landing ? m.landing.text + ' ' + m.landing.fpm + 'fpm' : 'no touchdown'}`);
  ok(m.onGround && m.tele.speedKt < 20, `landing: stopped on runway (speed ${fmt(m.tele.speedKt, 0)}kt, z=${fmt(m.pos.z, 0)}, phase ${m.phase})`);
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
