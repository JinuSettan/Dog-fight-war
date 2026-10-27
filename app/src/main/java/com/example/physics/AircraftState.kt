package com.example.physics

enum class GearState(val label: String) {
    DOWN("DOWN"),
    TRANSITIONING("TRANSIT"),
    UP("UP")
}

enum class EngineState(val label: String) {
    OFF("OFF"),
    STARTING("STARTING"),
    RUNNING("RUNNING"),
    AFTERBURNER("AFTERBURNER"),
    FLAMEOUT("FLAMEOUT")
}

/**
 * Central Aircraft State (Phase 1 Architecture)
 *
 * Single source of truth for all flight instruments, HUD elements,
 * audio hooks, and the developer debug overlay.
 */
data class AircraftState(
    val airspeedMS: Float = 0f,
    val airspeedKnots: Float = 0f,
    val trueAirspeedMS: Float = 0f,
    val groundSpeedKnots: Float = 0f,
    val altitudeMeters: Float = 0f,
    val altitudeFeet: Float = 0f,
    val verticalSpeedMS: Float = 0f,
    val verticalSpeedFpm: Float = 0f,
    val headingDeg: Float = 0f,
    val pitchDeg: Float = 0f,
    val rollDeg: Float = 0f,
    val yawDeg: Float = 0f,
    val pitchRateDegSec: Float = 0f,
    val rollRateDegSec: Float = 0f,
    val yawRateDegSec: Float = 0f,
    val angleOfAttackDeg: Float = 0f,
    val sideslipDeg: Float = 0f,
    val throttle: Float = 0f,
    val engineThrustN: Float = 0f,
    val liftForceN: Float = 0f,
    val dragForceN: Float = 0f,
    val gravityForceN: Float = 0f,
    val normalForceN: Float = 0f,
    val fuelKg: Float = 3100f,
    val fuelCapacityKg: Float = 3100f,
    val flapsPosition: Float = 0f,      // 0.0 (retracted) to 1.0 (full landing flaps)
    val airbrakePosition: Float = 0f,   // 0.0 (retracted) to 1.0 (deployed)
    val gearState: GearState = GearState.DOWN,
    val brakeState: Boolean = true,
    val stallState: Boolean = false,
    val engineState: EngineState = EngineState.RUNNING,
    val airDensityKgM3: Float = 1.225f,
    val dynamicPressurePa: Float = 0f,
    val cL: Float = 0f,
    val cD: Float = 0f,
    val gForce: Float = 1.0f,
    val windVelocityMS: Vector3D = Vector3D.ZERO,
    val turbulenceIntensity: Float = 0f,
    val netForceWorld: Vector3D = Vector3D.ZERO,
    val netTorqueBody: Vector3D = Vector3D.ZERO,
    val fps: Float = 60f
)
