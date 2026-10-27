package com.example

import com.example.physics.AircraftConfig
import com.example.physics.FlightPhysicsEngine
import com.example.physics.Vector3D
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs

class FlightPhysicsEngineTest {

    private val config = AircraftConfig.F16_FIGHTER
    private val engine = FlightPhysicsEngine(config)

    @Test
    fun testDynamicPressureCalculation() {
        // At sea level (0m) and 100 m/s: q = 0.5 * 1.225 * 100^2 = 6125 Pa
        val qSeaLevel = engine.calculateDynamicPressure(altitudeM = 0f, speedMS = 100f)
        assertEquals(6125f, qSeaLevel, 10f)

        // At 8500m (scale height), density rho = rho0 / e ~ 0.4506 kg/m^3
        val qHighAlt = engine.calculateDynamicPressure(altitudeM = 8500f, speedMS = 100f)
        assertTrue("Dynamic pressure at high altitude should be lower than sea level", qHighAlt < qSeaLevel)
        assertEquals(qSeaLevel / Math.E.toFloat(), qHighAlt, 50f)
    }

    @Test
    fun testAngleOfAttackCalculation() {
        val forward = Vector3D(0f, 0f, 1f)
        val up = Vector3D(0f, 1f, 0f)

        // Velocity aligned with forward chord line -> AoA = 0 deg
        val velLevel = Vector3D(0f, 0f, 100f)
        val aoaLevel = engine.calculateAngleOfAttack(velLevel, forward, up)
        assertEquals(0f, aoaLevel, 0.01f)

        // Velocity sinking relative to aircraft nose (aircraft pitching up into airflow) -> Positive AoA
        val velDescendingAirflow = Vector3D(0f, -10f, 100f)
        val aoaPositive = engine.calculateAngleOfAttack(velDescendingAirflow, forward, up)
        assertTrue("AoA should be positive when airflow comes from below nose", aoaPositive > 0f)
        assertEquals(5.71f, aoaPositive, 0.2f)

        // Airflow from above aircraft nose -> Negative AoA
        val velAscendingAirflow = Vector3D(0f, 10f, 100f)
        val aoaNegative = engine.calculateAngleOfAttack(velAscendingAirflow, forward, up)
        assertTrue("AoA should be negative when airflow comes from above nose", aoaNegative < 0f)
        assertEquals(-5.71f, aoaNegative, 0.2f)
    }

    @Test
    fun testGravityCalculation() {
        val gravity = engine.calculateGravity(config.massKg)
        val expectedWeight = config.massKg * 9.81f

        assertEquals(0f, gravity.x, 0.001f)
        assertEquals(-expectedWeight, gravity.y, 0.1f)
        assertEquals(0f, gravity.z, 0.001f)
        assertEquals(expectedWeight, abs(gravity.y), 0.1f)
    }

    @Test
    fun testLiftAndDragForces() {
        val speedMS = 120f
        val dynPressure = engine.calculateDynamicPressure(0f, speedMS)
        val cl = 0.8f
        val cd = 0.05f

        val lift = engine.calculateLift(dynPressure, config.wingAreaM2, cl)
        val drag = engine.calculateDrag(dynPressure, config.wingAreaM2, cd)

        val expectedLift = dynPressure * config.wingAreaM2 * cl
        val expectedDrag = dynPressure * config.wingAreaM2 * cd

        assertEquals(expectedLift, lift, 1.0f)
        assertEquals(expectedDrag, drag, 1.0f)
        assertTrue("Lift should exceed drag for standard cruise L/D ratio", lift > drag)
    }

    @Test
    fun testCalculateAerodynamicForcesResolution() {
        val vel = Vector3D(0f, 0f, 150f)
        val forward = Vector3D(0f, 0f, 1f)
        val up = Vector3D(0f, 1f, 0f)
        val right = Vector3D(1f, 0f, 0f)

        val forces = engine.calculateAerodynamicForces(
            vel = vel,
            forwardVec = forward,
            upVec = up,
            rightVec = right,
            altitudeM = 1000f,
            thrustRatio = 0.8f,
            afterburner = false,
            flaps = false,
            airbrake = false,
            gearDown = false,
            onGround = false
        )

        assertNotNull(forces)
        assertTrue("Lift force should be positive", forces.liftN >= 0f)
        assertTrue("Drag force should be positive", forces.dragN > 0f)
        assertTrue("Thrust force should match engine command", forces.thrustN > 50000f)
        assertEquals(config.massKg * 9.81f, forces.gravityN, 1.0f)
        assertFalse("Aircraft should not stall in level cruise", forces.isStalling)
    }

    @Test
    fun testPitchVisiblyFollowsElevatorInput() {
        val testEngine = FlightPhysicsEngine(config)
        testEngine.reset(startAltitudeMeters = 1500f, startAirspeedKnots = 300f)

        // Pull back on elevator stick (pitchInput > 0)
        testEngine.pitchInput = 1.0f
        testEngine.rollInput = 0f
        testEngine.yawInput = 0f

        for (i in 0 until 10) {
            testEngine.update(1f / 60f)
        }

        assertTrue("Pitch angle should increase positively (nose up) on elevator pull", testEngine.pitchDeg() > 0.5f)
        assertTrue("Forward vector Y component should be positive when pitched up", testEngine.forwardVector.y > 0.01f)
    }

    @Test
    fun testRollVisiblyFollowsAileronInput() {
        val testEngine = FlightPhysicsEngine(config)
        testEngine.reset(startAltitudeMeters = 1500f, startAirspeedKnots = 300f)

        // Push stick right (rollInput > 0)
        testEngine.rollInput = 1.0f
        testEngine.pitchInput = 0f
        testEngine.yawInput = 0f

        for (i in 0 until 10) {
            testEngine.update(1f / 60f)
        }

        assertTrue("Roll angle should increase positively (bank right)", testEngine.rollDeg() > 1.0f)
    }

    @Test
    fun testYawRotatesHeading() {
        val testEngine = FlightPhysicsEngine(config)
        testEngine.reset(startAltitudeMeters = 1500f, startAirspeedKnots = 300f)

        // Push right rudder (yawInput > 0)
        testEngine.yawInput = 1.0f
        val initialYaw = testEngine.yawRad

        for (i in 0 until 10) {
            testEngine.update(1f / 60f)
        }

        assertTrue("Heading yaw should rotate right on right rudder", testEngine.yawRad > initialYaw)
    }

    @Test
    fun testTakeoffRotationFollowedByLiftoff() {
        val testEngine = FlightPhysicsEngine(config)
        testEngine.resetToCarrier()
        testEngine.update(1f / 60f)

        assertTrue("Aircraft starts on runway", testEngine.isOnGround)
        assertEquals(testEngine.CARRIER_ALTITUDE, testEngine.position.y, 0.01f)

        // Full throttle & afterburner acceleration
        testEngine.throttle = 1.0f
        testEngine.isAfterburner = true
        testEngine.isParkingBrakeSet = false
        testEngine.isWheelBrakesActive = false

        // Accelerate along runway (~9 seconds roll)
        for (i in 0 until 550) {
            testEngine.update(1f / 60f)
        }

        assertTrue("Aircraft reaches rotation speed", testEngine.airspeedKnots > config.rotationSpeedKnots * 0.75f)

        // Pilot rotates nose up (pulls stick back)
        testEngine.pitchInput = 0.8f
        for (i in 0 until 120) {
            testEngine.update(1f / 60f)
        }

        assertTrue("Nose rotates up during takeoff roll", testEngine.pitchDeg() > 2.0f)
        assertTrue("Aircraft lifts off runway into climb", testEngine.position.y > 0.1f || testEngine.verticalSpeedFpm > 50f || !testEngine.isOnGround)
    }
}
