package com.example.physics

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin

/**
 * LiftModel
 *
 * Calculates air density (ISA atmosphere), ground effect factor, and
 * Lift Coefficient (CL) across linear pre-stall and separated post-stall regimes.
 */
object LiftModel {
    private const val SEA_LEVEL_AIR_DENSITY = 1.225f // kg/m^3

    /**
     * Barometric air density rho(h) = rho0 * exp(-h / 8500m)
     */
    fun calculateAirDensity(altitudeMeters: Float): Float {
        return SEA_LEVEL_AIR_DENSITY * exp(-max(0f, altitudeMeters) / 8500f)
    }

    /**
     * Ground effect lift amplification when altitude above ground is within 1 wingspan.
     */
    fun calculateGroundEffectLiftFactor(aglMeters: Float, wingspanMeters: Float): Float {
        if (wingspanMeters <= 0.1f) return 1.0f
        val groundHeightRatio = (aglMeters / wingspanMeters).coerceIn(0f, 1f)
        return 1.0f + (1.0f - groundHeightRatio) * 0.15f
    }

    /**
     * Computes total Lift Coefficient (CL) from Angle of Attack (alpha), flap deflection,
     * spoiler/airbrake lift dump, ground effect, and post-stall separation.
     */
    fun calculateLiftCoefficient(
        alphaDeg: Float,
        flapsPosition: Float,
        airbrakePosition: Float,
        onGround: Boolean,
        aglMeters: Float,
        config: AircraftConfig
    ): Float {
        val alphaRad = Math.toRadians(alphaDeg.toDouble()).toFloat()
        val stallAngleRad = Math.toRadians(config.stallAngleDeg.toDouble()).toFloat()
        val flapsBoostCL = 0.40f * flapsPosition.coerceIn(0f, 1f)
        val airbrakeDumpCL = if (onGround) -0.30f * airbrakePosition.coerceIn(0f, 1f) else 0f
        val groundEffectLiftFactor = calculateGroundEffectLiftFactor(aglMeters, config.wingspanM)

        val rawCL = if (abs(alphaRad) <= stallAngleRad) {
            // Linear pre-stall lift slope: CL = 2*PI*alpha + flaps
            ((2f * PI.toFloat() * alphaRad) + flapsBoostCL + airbrakeDumpCL) * groundEffectLiftFactor
        } else {
            // Post-stall boundary layer separation drop
            val sign = if (alphaRad >= 0f) 1f else -1f
            val overStall = abs(alphaRad) - stallAngleRad
            val stallDropFactor = max(0.15f, cos(min(PI.toFloat() / 2f, overStall * 3.5f)))
            sign * (config.cLMax + flapsBoostCL) * stallDropFactor * groundEffectLiftFactor
        }
        return rawCL.coerceIn(-1.5f, config.cLMax + flapsBoostCL)
    }

    fun calculateLiftForce(dynamicPressurePa: Float, wingAreaM2: Float, cL: Float): Float {
        return max(0f, dynamicPressurePa * wingAreaM2 * cL)
    }
}

/**
 * DragModel
 *
 * Calculates total Drag Coefficient (CD) combining parasitic drag, lift-induced drag
 * (with ground effect reduction), flap drag, landing gear drag, airbrake drag,
 * sideslip fuselage drag, and post-stall separation pressure drag.
 */
object DragModel {
    fun calculateGroundEffectDragFactor(aglMeters: Float, wingspanMeters: Float): Float {
        if (wingspanMeters <= 0.1f) return 1.0f
        val groundHeightRatio = (aglMeters / wingspanMeters).coerceIn(0f, 1f)
        return 1.0f - (1.0f - groundHeightRatio) * 0.35f
    }

    fun calculateDragCoefficient(
        cL: Float,
        alphaDeg: Float,
        sideslipDeg: Float,
        flapsPosition: Float,
        airbrakePosition: Float,
        gearDownRatio: Float,
        aglMeters: Float,
        config: AircraftConfig
    ): Float {
        val flapsDrag = 0.045f * flapsPosition.coerceIn(0f, 1f)
        val airbrakeDrag = 0.090f * airbrakePosition.coerceIn(0f, 1f)
        val gearDrag = 0.035f * gearDownRatio.coerceIn(0f, 1f)

        val betaRad = Math.toRadians(sideslipDeg.toDouble()).toFloat()
        val sideslipDrag = 0.12f * sin(betaRad) * sin(betaRad)

        val overStallDeg = max(0f, abs(alphaDeg) - config.stallAngleDeg)
        val overStallRad = Math.toRadians(overStallDeg.toDouble()).toFloat()
        val stallDrag = if (overStallDeg > 0f) 0.85f * sin(overStallRad) * sin(overStallRad) else 0f

        val groundEffectDragFactor = calculateGroundEffectDragFactor(aglMeters, config.wingspanM)
        return config.cD0 + (config.kInducedDrag * cL * cL * groundEffectDragFactor) +
            flapsDrag + airbrakeDrag + gearDrag + sideslipDrag + stallDrag
    }

    fun calculateDragForce(dynamicPressurePa: Float, wingAreaM2: Float, cD: Float): Float {
        return max(0f, dynamicPressurePa * wingAreaM2 * cD)
    }
}

/**
 * EngineModel
 *
 * Simulates turbine spool-up/down lag, altitude air density thrust lapse,
 * afterburner augmentation, and fuel burn.
 */
object EngineModel {
    fun updateSpool(
        currentSpool: Float,
        targetThrottle: Float,
        hasFuel: Boolean,
        dtSec: Float
    ): Float {
        if (!hasFuel) {
            return (currentSpool - dtSec * 0.6f).coerceAtLeast(0f)
        }
        val clampedTarget = targetThrottle.coerceIn(0f, 1f)
        val spoolSpeed = 1.8f // ~1.5 - 2.0s spool response
        return currentSpool + (clampedTarget - currentSpool) * min(1f, dtSec * spoolSpeed)
    }

    fun calculateThrustMagnitude(
        spoolRatio: Float,
        afterburner: Boolean,
        airDensityKgM3: Float,
        airspeedMS: Float,
        hasFuel: Boolean,
        config: AircraftConfig
    ): Float {
        if (!hasFuel) return 0f
        val maxAvailableThrust = if (afterburner) config.afterburnerThrustN else config.maxThrustN
        // Subtle density & ram recovery modulation while keeping sea-level/low-alt thrust responsive
        val densityRatio = (airDensityKgM3 / 1.225f).coerceIn(0.25f, 1.0f)
        val mach = airspeedMS / 340.3f
        val envFactor = (densityRatio.pow(0.35f) * (1.0f + 0.15f * mach * mach)).coerceIn(0.45f, 1.15f)
        return spoolRatio.coerceIn(0f, 1f) * maxAvailableThrust * envFactor
    }

    fun calculateFuelBurnKg(
        thrustN: Float,
        afterburner: Boolean,
        dtSec: Float
    ): Float {
        val tsfc = if (afterburner) 0.000042f else 0.000018f
        return thrustN * tsfc * dtSec
    }
}

/**
 * WindSystem
 *
 * Provides configurable ambient 3D wind vector and continuous Dryden-style
 * atmospheric turbulence gusts and rotational disturbances.
 */
class WindSystem {
    var isWindEnabled: Boolean = false
    var isTurbulenceEnabled: Boolean = false

    // Default headwind/crosswind vector (m/s) when enabled
    var baseWindVelocityMS: Vector3D = Vector3D(3.5f, 0f, -6.0f)
    var turbulenceIntensity: Float = 0.30f // 0.0 (calm) to 1.0 (severe)

    private var gustTimeSec: Float = 0f
    var currentWindVelocityMS: Vector3D = Vector3D.ZERO
        private set
    var currentTurbulenceAngularAccel: Vector3D = Vector3D.ZERO
        private set

    fun update(dtSec: Float, altitudeMeters: Float, airspeedMS: Float) {
        gustTimeSec += dtSec

        if (!isWindEnabled) {
            currentWindVelocityMS = Vector3D.ZERO
            currentTurbulenceAngularAccel = Vector3D.ZERO
            return
        }

        val altShearFactor = (0.6f + (altitudeMeters / 1500f).coerceIn(0f, 0.8f))
        val steadyWind = baseWindVelocityMS * altShearFactor

        if (!isTurbulenceEnabled || turbulenceIntensity <= 0.001f) {
            currentWindVelocityMS = steadyWind
            currentTurbulenceAngularAccel = Vector3D.ZERO
            return
        }

        val t = gustTimeSec
        val amp = turbulenceIntensity * 3.2f
        val gx = amp * (0.5f * sin(t * 1.3f) + 0.3f * cos(t * 3.1f) + 0.2f * sin(t * 5.7f))
        val gy = amp * 0.7f * (0.5f * cos(t * 1.9f) + 0.35f * sin(t * 4.3f) + 0.15f * cos(t * 7.1f))
        val gz = amp * (0.5f * cos(t * 1.1f) + 0.3f * sin(t * 2.7f) + 0.2f * cos(t * 6.3f))

        currentWindVelocityMS = steadyWind + Vector3D(gx, gy, gz)

        val speedFactor = (airspeedMS / 80f).coerceIn(0f, 1.5f)
        val pitchGust = turbulenceIntensity * speedFactor * 0.25f * cos(t * 2.1f + 0.4f)
        val yawGust = turbulenceIntensity * speedFactor * 0.18f * sin(t * 1.7f + 2.3f)
        val rollGust = turbulenceIntensity * speedFactor * 0.45f * sin(t * 2.9f + 1.1f)
        currentTurbulenceAngularAccel = Vector3D(pitchGust, yawGust, rollGust)
    }
}

/**
 * Resolved 6-DOF Aerodynamic Forces & Torques
 */
data class SixDofAeroResult(
    val forces: AerodynamicForces,
    val pitchTorqueNm: Float,
    val yawTorqueNm: Float,
    val rollTorqueNm: Float,
    val airDensityKgM3: Float,
    val relativeAirVelocityMS: Vector3D
)

/**
 * Aerodynamics
 *
 * Combines LiftModel, DragModel, EngineModel, and rotational moment equations
 * to compute 3D forces and 3D torques acting on the aircraft rigid body.
 */
object Aerodynamics {
    fun evaluateTorques(
        dynPressurePa: Float,
        trueAirspeedMS: Float,
        aoaDeg: Float,
        sideslipDeg: Float,
        pitchRateRadSec: Float,
        rollRateRadSec: Float,
        yawRateRadSec: Float,
        elevatorInput: Float,
        aileronInput: Float,
        rudderInput: Float,
        isStalling: Boolean,
        config: AircraftConfig
    ): Vector3D {
        val dynamicAuthorityFactor = (dynPressurePa / 1000f).coerceIn(0.15f, 1.4f)
        val targetPitchRate = elevatorInput * config.pitchRateMaxRadSec * dynamicAuthorityFactor
        val targetRollRate = aileronInput * config.rollRateMaxRadSec * dynamicAuthorityFactor
        val targetYawRate = rudderInput * config.yawRateMaxRadSec * dynamicAuthorityFactor

        // Rotational torque = MomentOfInertia * angularAcceleration
        // Derived from control surface deflection, aerodynamic damping, weathercock stability, and stall pitch-down moment
        var pitchAngularAccel = (targetPitchRate - pitchRateRadSec) * 12.0f - (pitchRateRadSec * 0.8f * dynamicAuthorityFactor)
        val rollAngularAccel = (targetRollRate - rollRateRadSec) * 14.0f - (rollRateRadSec * 1.2f * dynamicAuthorityFactor)
        var yawAngularAccel = (targetYawRate - yawRateRadSec) * 10.0f

        if (trueAirspeedMS > 10f) {
            val sideSlipRad = Math.toRadians(sideslipDeg.toDouble()).toFloat()
            val weathercockAccel = -sideSlipRad * 3.5f * dynamicAuthorityFactor
            yawAngularAccel += weathercockAccel
        }

        if (isStalling) {
            // Aerodynamic nose-down stall recovery moment
            pitchAngularAccel += -0.85f
        }

        val pitchTorqueNm = pitchAngularAccel * config.inertiaPitchKgM2
        val yawTorqueNm = yawAngularAccel * config.inertiaYawKgM2
        val rollTorqueNm = rollAngularAccel * config.inertiaRollKgM2

        return Vector3D(pitchTorqueNm, yawTorqueNm, rollTorqueNm)
    }
}
