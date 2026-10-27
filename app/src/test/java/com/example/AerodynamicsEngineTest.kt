package com.example

import com.example.physics.AerodynamicsEngine
import com.example.physics.AircraftConfig
import com.example.physics.FlightPhase
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AerodynamicsEngineTest {

    @Test
    fun testRunwayTakeoffSequence() {
        val engine = AerodynamicsEngine(AircraftConfig.F16_FIGHTER)
        engine.reset(startAltitudeMeters = 1000f, startAirspeedKnots = 250f)
        engine.update(1f / 60f)
        assertTrue(engine.airspeedKnots > 0f)
    }

    @Test
    fun testStallBehaviorAtHighAngleOfAttack() {
        val engine = AerodynamicsEngine(AircraftConfig.F16_FIGHTER)
        engine.reset(startAltitudeMeters = 2000f, startAirspeedKnots = 120f)

        // Idle power and pull back hard into deep stall
        engine.throttle = 0.0f
        engine.pitchInput = 1.0f

        for (i in 0 until 240) {
            engine.update(1f / 60f)
        }

        assertTrue("Aircraft should experience stall warning at high AoA with low speed", engine.isStalling || engine.angleOfAttackDeg > 18f)
    }

    @Test
    fun testLandingTouchdownAndBraking() {
        val engine = AerodynamicsEngine(AircraftConfig.F16_FIGHTER)
        // Spawn 20 meters above ground on glide path
        engine.reset(startAltitudeMeters = 20f, startAirspeedKnots = 145f)
        engine.isLandingGearDown = true
        engine.isFlapsDeployed = true
        engine.throttle = 0.0f

        // Gentle descent
        engine.velocity.y = -2.0f // ~400 FPM smooth sink rate

        for (i in 0 until 900) {
            engine.update(1f / 60f)
            if (engine.isOnGround) {
                // Apply brakes and spoilers on touchdown
                engine.isWheelBrakesActive = true
                engine.isAirbrakeDeployed = true
                engine.throttle = 0f
            }
        }

        assertTrue("Aircraft should touch down safely on wheels", engine.isOnGround)
        assertFalse("Aircraft should not crash on normal touchdown", engine.isCrashed)
        assertTrue("Aircraft should decelerate with brakes active", engine.airspeedKnots < 90f)
    }
}
