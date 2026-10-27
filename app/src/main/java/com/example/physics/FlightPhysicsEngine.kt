package com.example.physics

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt
import kotlin.math.tan

/**
 * Data structure holding all resolved instantaneous aerodynamic and physical forces.
 */
data class AerodynamicForces(
    val liftN: Float,
    val dragN: Float,
    val thrustN: Float,
    val gravityN: Float,
    val forceLift: Vector3D,
    val forceDrag: Vector3D,
    val forceThrust: Vector3D,
    val forceGravity: Vector3D,
    val netForce: Vector3D,
    val angleOfAttackDeg: Float,
    val sideslipDeg: Float,
    val dynamicPressurePa: Float,
    val cL: Float,
    val cD: Float,
    val isStalling: Boolean
)

enum class FlightPhase(val label: String) {
    PARKED_ON_RUNWAY("Parked on Runway"),
    TAKEOFF_ROLL("Runway Takeoff Roll"),
    ROTATING("Rotating (Vr)"),
    LIFTOFF_CLIMB("Airborne Climb"),
    CRUISE("Cruise Flight"),
    APPROACH("Landing Approach"),
    TOUCHDOWN_ROLLOUT("Touchdown Rollout"),
    SAFELY_STOPPED("Stopped on Runway"),
    CRASHED("Crashed")
}

/**
 * FlightPhysicsEngine (AircraftFlightPhysics)
 *
 * Reusable 6-DOF physics-based flight model calculating aircraft movement from:
 * - Thrust, Lift, Drag, Gravity
 * - Aircraft mass & Rotational Moments of Inertia (I_xx, I_yy, I_zz)
 * - Air density & Dynamic pressure
 * - Airspeed, Angle of Attack (alpha), Sideslip (beta)
 * - Pitch, Roll, Yaw & Control Surface Torques (Elevator, Aileron, Rudder)
 * - Flaps, Airbrake, Landing Gear drag, Ground Effect, Stall behavior
 * - Basic Wind & Atmospheric Turbulence
 */
class FlightPhysicsEngine(
    var config: AircraftConfig = AircraftConfig.F16_FIGHTER
) {
    // 3D Position (meters) - World Origin (0, 0, 0) is runway touchdown zone
    var position = Vector3D(0f, 0f, -800f)

    // Linear Velocity (m/s) in world coordinates
    var velocity = Vector3D(0f, 0f, 0f)

    // Aircraft Euler Orientation (radians)
    var pitchRad: Float = 0f  // + nose up, - nose down
    var yawRad: Float = 0f    // 0 = Runway Heading (North / +Z)
    var rollRad: Float = 0f   // + bank right, - bank left

    // Angular Velocities (rad/s)
    var pitchRate: Float = 0f
    var rollRate: Float = 0f
    var yawRate: Float = 0f

    // Pilot Inputs (-1.0 to 1.0)
    var pitchInput: Float = 0f  // Elevator (-1 to 1: positive = pull back / pitch up)
    var rollInput: Float = 0f   // Aileron (-1 to 1: positive = right roll)
    var yawInput: Float = 0f    // Rudder pedals / nosewheel steering (-1 to 1)
    var throttle: Float = 0.0f  // Throttle command (0.0 to 1.0)
    var isAfterburner: Boolean = false

    // Control Surfaces & Mechanical Systems
    var isFlapsDeployed: Boolean = false     // Increases CL & Drag for takeoff/approach
    var flapsPosition: Float = 0f            // Continuous flap actuator position (0.0 to 1.0)
    var isAirbrakeDeployed: Boolean = false  // Increases Drag / dumps lift on touchdown
    var airbrakePosition: Float = 0f         // Continuous airbrake actuator position (0.0 to 1.0)
    var isLandingGearDown: Boolean = true    // Landing gear extended/retracted
    var gearPosition: Float = 1f             // Continuous gear actuator position (0.0 up to 1.0 down)
    var isWheelBrakesActive: Boolean = false // Wheel brakes applied on ground
    var isParkingBrakeSet: Boolean = true    // Initial parking brake

    // Engine & Fuel State
    var actualEngineThrustRatio: Float = 0f
    var fuelKg: Float = config.fuelCapacityKg
    var engineState: EngineState = EngineState.RUNNING

    // Weather / Wind & Turbulence Subsystem
    val windSystem = WindSystem()

    // Developer Debug Mode & 3D Force Vector Visualization Toggle
    var showForceVectors: Boolean = false
    var fps: Float = 60.0f
    var lastAeroForces: AerodynamicForces? = null
    var lastNetTorqueBody: Vector3D = Vector3D.ZERO

    // Central Aircraft State (Read by HUD, Instruments, and Debug Overlay)
    var state: AircraftState = AircraftState()
        private set

    // Computed Flight Telemetry
    var airspeedMS: Float = 0f
    var airspeedKnots: Float = 0f
    var groundSpeedKnots: Float = 0f
    var altitudeMeters: Float = 0f
    var altitudeFeet: Float = 0f
    var verticalSpeedFpm: Float = 0f
    var angleOfAttackDeg: Float = 0f
    var sideSlipDeg: Float = 0f
    var thrustN: Float = 0f
    var liftN: Float = 0f
    var dragN: Float = 0f
    var weightN: Float = 0f
    var normalForceN: Float = 0f
    var brakingForceN: Float = 0f
    var gForce: Float = 1.0f
    var cLCurrent: Float = 0f
    var cDCurrent: Float = 0f
    var dynamicPressurePa: Float = 0f
    var airDensityKgM3: Float = 1.225f
    var isStalling: Boolean = false
    var isOnGround: Boolean = true
    var isCrashed: Boolean = false
    var crashReason: String = ""
    var landingQualityText: String? = null

    // Autopilot state & targets
    var isAutopilotEnabled: Boolean = false
    var autopilotTargetHeadingRad: Float = 0f
    var autopilotTargetAltitudeMeters: Float = 0f

    // Flight Phase tracker
    var currentPhase: FlightPhase = FlightPhase.PARKED_ON_RUNWAY

    // Orientation Unit Vectors
    var forwardVector = Vector3D(0f, 0f, 1f)
    var upVector = Vector3D(0f, 1f, 0f)
    var rightVector = Vector3D(1f, 0f, 0f)

    init {
        resetToCarrier()
    }

    /**
     * Calculate barometric dynamic pressure q = 0.5 * rho * v^2
     */
    fun calculateDynamicPressure(altitudeM: Float, speedMS: Float): Float {
        val rho = LiftModel.calculateAirDensity(altitudeM)
        return 0.5f * rho * speedMS * speedMS
    }

    /**
     * Calculate Angle of Attack (alpha) in degrees between relative airflow and aircraft chord line.
     */
    fun calculateAngleOfAttack(vel: Vector3D, forwardVec: Vector3D, upVec: Vector3D): Float {
        val speed = vel.length()
        if (speed < 0.2f) return 0f
        val velDir = vel / speed
        val velInBodyY = velDir.dot(upVec)
        val velInBodyZ = velDir.dot(forwardVec)
        val alphaRad = if (abs(velInBodyZ) > 0.0001f || abs(velInBodyY) > 0.0001f) -atan2(velInBodyY, velInBodyZ) else 0f
        return Math.toDegrees(alphaRad.toDouble()).toFloat()
    }

    /**
     * Calculate Sideslip angle (beta) in degrees.
     */
    fun calculateSideslip(vel: Vector3D, forwardVec: Vector3D, rightVec: Vector3D): Float {
        val speed = vel.length()
        if (speed < 0.2f) return 0f
        val velDir = vel / speed
        val velInBodyX = velDir.dot(rightVec)
        val velInBodyZ = velDir.dot(forwardVec)
        val betaRad = if (abs(velInBodyZ) > 0.0001f || abs(velInBodyX) > 0.0001f) atan2(velInBodyX, velInBodyZ) else 0f
        return Math.toDegrees(betaRad.toDouble()).toFloat()
    }

    /**
     * Calculate Lift Coefficient (CL) taking into account angle of attack, stall polar, and flaps.
     */
    fun calculateLiftCoefficient(
        alphaDeg: Float,
        flaps: Boolean,
        airbrake: Boolean,
        onGround: Boolean,
        groundHeightRatio: Float = 1f
    ): Float {
        val flapPos = if (flaps) max(0.5f, flapsPosition) else 0f
        val brakePos = if (airbrake) max(0.5f, airbrakePosition) else 0f
        val aglMeters = groundHeightRatio * config.wingspanM
        return LiftModel.calculateLiftCoefficient(
            alphaDeg = alphaDeg,
            flapsPosition = flapPos,
            airbrakePosition = brakePos,
            onGround = onGround,
            aglMeters = aglMeters,
            config = config
        )
    }

    /**
     * Calculate Drag Coefficient (CD) taking into account parasitic drag, induced drag, gear, flaps, and airbrakes.
     */
    fun calculateDragCoefficient(
        cl: Float,
        flaps: Boolean,
        airbrake: Boolean,
        gearDown: Boolean,
        groundHeightRatio: Float = 1f
    ): Float {
        val flapPos = if (flaps) max(0.5f, flapsPosition) else 0f
        val brakePos = if (airbrake) max(0.5f, airbrakePosition) else 0f
        val gearPos = if (gearDown) 1f else 0f
        val aglMeters = groundHeightRatio * config.wingspanM
        return DragModel.calculateDragCoefficient(
            cL = cl,
            alphaDeg = angleOfAttackDeg,
            sideslipDeg = sideSlipDeg,
            flapsPosition = flapPos,
            airbrakePosition = brakePos,
            gearDownRatio = gearPos,
            aglMeters = aglMeters,
            config = config
        )
    }

    /**
     * Calculate Lift force magnitude: L = q * S * CL
     */
    fun calculateLift(dynamicPressurePa: Float, wingAreaM2: Float, cL: Float): Float {
        return LiftModel.calculateLiftForce(dynamicPressurePa, wingAreaM2, cL)
    }

    /**
     * Calculate Drag force magnitude: D = q * S * CD
     */
    fun calculateDrag(dynamicPressurePa: Float, wingAreaM2: Float, cD: Float): Float {
        return DragModel.calculateDragForce(dynamicPressurePa, wingAreaM2, cD)
    }

    /**
     * Calculate Gravity Force vector: W = m * g (downward)
     */
    fun calculateGravity(massKg: Float): Vector3D {
        val weightMagnitude = massKg * 9.81f
        return Vector3D(0f, -weightMagnitude, 0f)
    }

    /**
     * Calculate Thrust Force vector along the engine thrust axis.
     */
    fun calculateThrust(
        thrustRatio: Float,
        afterburner: Boolean,
        forwardVec: Vector3D
    ): Vector3D {
        val maxAvailableThrust = if (afterburner) config.afterburnerThrustN else config.maxThrustN
        val magnitude = thrustRatio.coerceIn(0f, 1f) * maxAvailableThrust
        return forwardVec * magnitude
    }

    /**
     * Calculate all aerodynamic forces and resolution vectors based on relative air velocity and AoA.
     */
    fun calculateAerodynamicForces(
        vel: Vector3D,
        forwardVec: Vector3D,
        upVec: Vector3D,
        rightVec: Vector3D,
        altitudeM: Float,
        thrustRatio: Float,
        afterburner: Boolean,
        flaps: Boolean,
        airbrake: Boolean,
        gearDown: Boolean,
        onGround: Boolean
    ): AerodynamicForces {
        val relVel = if (windSystem.isWindEnabled && !onGround) {
            vel - windSystem.currentWindVelocityMS
        } else {
            vel
        }
        val speed = relVel.length()
        val dynPressure = calculateDynamicPressure(altitudeM, speed)
        val aoaDeg = calculateAngleOfAttack(relVel, forwardVec, upVec)
        val ssDeg = calculateSideslip(relVel, forwardVec, rightVec)

        val wingspanM = config.wingspanM.coerceAtLeast(8f)
        val surfaceY = getSurfaceHeightAt(position.x, position.z)
        val aglM = max(0f, altitudeM - surfaceY)
        val groundHeightRatio = (aglM / wingspanM).coerceIn(0f, 1f)

        val cl = calculateLiftCoefficient(aoaDeg, flaps, airbrake, onGround, groundHeightRatio)
        val cd = calculateDragCoefficient(cl, flaps, airbrake, gearDown, groundHeightRatio)

        val liftMagnitude = calculateLift(dynPressure, config.wingAreaM2, cl)
        val dragMagnitude = calculateDrag(dynPressure, config.wingAreaM2, cd)

        val velDir = if (speed > 0.3f) relVel / speed else forwardVec

        // Lift vector is perpendicular to relative velocity vector in the aircraft plane of symmetry
        val liftDir = velDir.cross(rightVec).normalized()
        val forceLift = liftDir * liftMagnitude

        // Drag vector opposes relative air velocity
        val forceDrag = velDir * (-dragMagnitude)

        // Gravity vector
        val forceGravity = calculateGravity(config.massKg)
        val gravMagnitude = config.massKg * 9.81f

        // Thrust vector
        val hasFuel = fuelKg > 0.1f
        val maxAvailableThrust = if (afterburner) config.afterburnerThrustN else config.maxThrustN
        val thrustMagnitude = if (hasFuel) thrustRatio.coerceIn(0f, 1f) * maxAvailableThrust else 0f
        val forceThrust = forwardVec * thrustMagnitude

        val netForce = forceThrust + forceLift + forceDrag + forceGravity
        val stalling = abs(aoaDeg) > config.stallAngleDeg && speed * 1.94384f > 25f && !onGround

        return AerodynamicForces(
            liftN = liftMagnitude,
            dragN = dragMagnitude,
            thrustN = thrustMagnitude,
            gravityN = gravMagnitude,
            forceLift = forceLift,
            forceDrag = forceDrag,
            forceThrust = forceThrust,
            forceGravity = forceGravity,
            netForce = netForce,
            angleOfAttackDeg = aoaDeg,
            sideslipDeg = ssDeg,
            dynamicPressurePa = dynPressure,
            cL = cl,
            cD = cd,
            isStalling = stalling
        )
    }

    // --- AIRCRAFT CARRIER / RUNWAY DIMENSIONS ---
    val CARRIER_ALTITUDE = 20.0f
    val CARRIER_LENGTH = 332.0f
    val CARRIER_WIDTH = 76.0f
    val CARRIER_START_Z = -166.0f
    val CARRIER_END_Z = 166.0f

    private fun getSurfaceHeightAt(x: Float, z: Float): Float {
        val onCarrier = x >= -CARRIER_WIDTH / 2f && x <= CARRIER_WIDTH / 2f && z >= CARRIER_START_Z && z <= CARRIER_END_Z
        return if (onCarrier) CARRIER_ALTITUDE else 0.0f
    }

    /**
     * Spawn parked on the carrier/runway deck ready for takeoff sequence.
     */
    fun resetToCarrier() {
        position = Vector3D(0f, CARRIER_ALTITUDE, CARRIER_START_Z + 20f)
        velocity = Vector3D(0f, 0f, 0f)
        pitchRad = 0f
        yawRad = 0f
        rollRad = 0f
        pitchRate = 0f
        rollRate = 0f
        yawRate = 0f
        pitchInput = 0f
        rollInput = 0f
        yawInput = 0f
        throttle = 0.0f
        actualEngineThrustRatio = 0.0f
        fuelKg = config.fuelCapacityKg
        engineState = EngineState.RUNNING
        isAfterburner = false
        isFlapsDeployed = false
        flapsPosition = 0f
        isAirbrakeDeployed = false
        airbrakePosition = 0f
        isLandingGearDown = true
        gearPosition = 1f
        isWheelBrakesActive = false
        isParkingBrakeSet = true
        isAutopilotEnabled = false
        isCrashed = false
        crashReason = ""
        landingQualityText = null
        isOnGround = true
        currentPhase = FlightPhase.PARKED_ON_RUNWAY
        updateVectors()
        syncStateSnapshot(0.016f)
    }

    /**
     * Spawn airborne at specified altitude and speed for immediate aerial flight / approach practice.
     */
    fun reset(startAltitudeMeters: Float = 1000f, startAirspeedKnots: Float = 250f) {
        position = Vector3D(0f, startAltitudeMeters, 0f)
        val startSpeedMS = startAirspeedKnots / 1.94384f
        velocity = Vector3D(0f, 0f, startSpeedMS)
        pitchRad = 0f
        yawRad = 0f
        rollRad = 0f
        pitchRate = 0f
        rollRate = 0f
        yawRate = 0f
        pitchInput = 0f
        rollInput = 0f
        yawInput = 0f
        throttle = 0.7f
        actualEngineThrustRatio = 0.7f
        fuelKg = config.fuelCapacityKg
        engineState = EngineState.RUNNING
        isAfterburner = false
        isFlapsDeployed = false
        flapsPosition = 0f
        isAirbrakeDeployed = false
        airbrakePosition = 0f
        isLandingGearDown = false
        gearPosition = 0f
        isWheelBrakesActive = false
        isParkingBrakeSet = false
        isAutopilotEnabled = false
        isCrashed = false
        crashReason = ""
        landingQualityText = null
        isOnGround = false
        currentPhase = FlightPhase.CRUISE
        updateVectors()
        syncStateSnapshot(0.016f)
    }

    /**
     * Phase 1 Test Preset: High-Angle-of-Attack Aerodynamic Stall Test
     */
    fun resetToStallTest() {
        reset(startAltitudeMeters = 1800f, startAirspeedKnots = 92f)
        pitchRad = Math.toRadians(22.0).toFloat()
        throttle = 0.15f
        actualEngineThrustRatio = 0.15f
        updateVectors()
        syncStateSnapshot(0.016f)
    }

    private fun updateVectors() {
        val rotMat = Matrix4.rotationYawPitchRoll(yawRad, pitchRad, rollRad)
        forwardVector = rotMat.transformVector(Vector3D(0f, 0f, 1f)).normalized()
        upVector = rotMat.transformVector(Vector3D(0f, 1f, 0f)).normalized()
        rightVector = rotMat.transformVector(Vector3D(1f, 0f, 0f)).normalized()
    }

    fun update(dtSec: Float) {
        if (dtSec <= 0f) return
        val dt = min(dtSec, 0.1f) // Protect against frame drop spikes
        fps = fps * 0.9f + (1f / max(0.001f, dtSec)) * 0.1f

        if (isCrashed) return

        updateVectors()

        // 0. MECHANICAL ACTUATORS (Flaps, Airbrake, Landing Gear continuous travel)
        val targetFlaps = if (isFlapsDeployed) 1.0f else 0.0f
        flapsPosition += (targetFlaps - flapsPosition) * min(1f, dt * 2.5f)

        val targetAirbrake = if (isAirbrakeDeployed) 1.0f else 0.0f
        airbrakePosition += (targetAirbrake - airbrakePosition) * min(1f, dt * 3.5f)

        val targetGear = if (isLandingGearDown) 1.0f else 0.0f
        gearPosition += (targetGear - gearPosition) * min(1f, dt * 1.8f)

        // 1. ENGINE SPOOL & FUEL DYNAMICS
        val hasFuel = fuelKg > 0.1f
        actualEngineThrustRatio = EngineModel.updateSpool(
            currentSpool = actualEngineThrustRatio,
            targetThrottle = throttle,
            hasFuel = hasFuel,
            dtSec = dt
        )

        // 2. SPEED, WIND & ATMOSPHERIC PROPERTIES
        altitudeMeters = max(0f, position.y)
        altitudeFeet = altitudeMeters * 3.28084f
        airDensityKgM3 = LiftModel.calculateAirDensity(altitudeMeters)

        windSystem.update(dt, altitudeMeters, velocity.length())
        val relAirVelocity = if (windSystem.isWindEnabled && !isOnGround) {
            velocity - windSystem.currentWindVelocityMS
        } else {
            velocity
        }

        val speed = relAirVelocity.length()
        airspeedMS = speed
        airspeedKnots = speed * 1.94384f
        val groundSpeedMS = sqrt(velocity.x * velocity.x + velocity.z * velocity.z)
        groundSpeedKnots = groundSpeedMS * 1.94384f

        // 3. AERODYNAMIC FORCES CALCULATION (Lift, Drag, Thrust, Gravity, AoA)
        val aero = calculateAerodynamicForces(
            vel = velocity,
            forwardVec = forwardVector,
            upVec = upVector,
            rightVec = rightVector,
            altitudeM = altitudeMeters,
            thrustRatio = actualEngineThrustRatio,
            afterburner = isAfterburner,
            flaps = isFlapsDeployed,
            airbrake = isAirbrakeDeployed,
            gearDown = isLandingGearDown,
            onGround = isOnGround
        )
        lastAeroForces = aero

        // Fuel consumption update
        val burnedFuel = EngineModel.calculateFuelBurnKg(aero.thrustN, isAfterburner, dt)
        fuelKg = (fuelKg - burnedFuel).coerceAtLeast(0f)
        engineState = when {
            fuelKg <= 0.1f -> EngineState.FLAMEOUT
            isAfterburner && actualEngineThrustRatio > 0.85f -> EngineState.AFTERBURNER
            actualEngineThrustRatio > 0.02f -> EngineState.RUNNING
            else -> EngineState.RUNNING
        }

        // Catapult Launch Assist (if full throttle + afterburner on carrier deck and low speed)
        val surfaceY = getSurfaceHeightAt(position.x, position.z)
        val onCarrier = surfaceY > 0f && position.y <= surfaceY + 0.5f
        var catapultForceVec = Vector3D(0f, 0f, 0f)
        var catapultThrustN = 0f
        if (onCarrier && isAfterburner && throttle > 0.95f && airspeedKnots < 150f) {
            catapultThrustN = 350000f
            catapultForceVec = forwardVector * catapultThrustN
        }

        dynamicPressurePa = aero.dynamicPressurePa
        angleOfAttackDeg = aero.angleOfAttackDeg
        sideSlipDeg = aero.sideslipDeg
        cLCurrent = aero.cL
        cDCurrent = aero.cD
        isStalling = aero.isStalling
        liftN = aero.liftN
        dragN = aero.dragN
        thrustN = aero.thrustN + catapultThrustN
        weightN = aero.gravityN

        var netForce = aero.netForce + catapultForceVec

        // 4. GROUND & RUNWAY WHEEL PHYSICS (TAKEOFF ROLL, TOUCHDOWN, BRAKING)
        val isLiftingOff = liftN >= weightN * 0.98f && pitchDeg() > 1.0f
        val touchingGround = (position.y <= surfaceY) || (position.y <= surfaceY + 0.05f && velocity.y <= 0.01f && !isLiftingOff)

        if (touchingGround && !isLiftingOff) {
            if (position.y < surfaceY) position.y = surfaceY
            isOnGround = true

            // Calculate Normal Force from Runway (Weight on Wheels)
            val verticalAeroForce = aero.forceLift.y + aero.forceThrust.y
            normalForceN = max(0f, weightN - verticalAeroForce)

            // Touchdown condition check
            if (velocity.y < -0.1f) {
                val sinkRateFpm = -velocity.y * 3.28084f * 60f
                if (!isLandingGearDown) {
                    isCrashed = true
                    crashReason = "Belly Crash Landing! Landing gear was retracted (Gear Up)."
                    currentPhase = FlightPhase.CRASHED
                    syncStateSnapshot(dt)
                    return
                } else if (sinkRateFpm > config.maxTouchdownSinkRateFpm) {
                    isCrashed = true
                    crashReason = "Landing Gear Structural Failure! Heavy Impact (Sink rate %.0f FPM, limit %.0f FPM)".format(
                        sinkRateFpm, config.maxTouchdownSinkRateFpm
                    )
                    currentPhase = FlightPhase.CRASHED
                    syncStateSnapshot(dt)
                    return
                } else if (abs(rollDeg()) > 16f) {
                    isCrashed = true
                    crashReason = "Wingtip Ground Strike! Aircraft was banked %.1f° on touchdown.".format(rollDeg())
                    currentPhase = FlightPhase.CRASHED
                    syncStateSnapshot(dt)
                    return
                } else if (pitchDeg() < -6f) {
                    isCrashed = true
                    crashReason = "Nosewheel Collapse! Aircraft pitched nose-first (%.1f°) on touchdown.".format(pitchDeg())
                    currentPhase = FlightPhase.CRASHED
                    syncStateSnapshot(dt)
                    return
                } else {
                    // Safe Touchdown!
                    landingQualityText = when {
                        sinkRateFpm < 250f -> "⭐ BUTTER! Greased Touchdown (%.0f FPM)".format(sinkRateFpm)
                        sinkRateFpm < 550f -> "Smooth Touchdown (%.0f FPM)".format(sinkRateFpm)
                        sinkRateFpm < 950f -> "Firm Landing (%.0f FPM)".format(sinkRateFpm)
                        else -> "Hard Landing (%.0f FPM) - Gear Intact".format(sinkRateFpm)
                    }
                    currentPhase = FlightPhase.TOUCHDOWN_ROLLOUT
                    velocity.y = 0f
                }
            } else if (velocity.y < 0f) {
                velocity.y = 0f
            }

            if (netForce.y < 0f) {
                netForce.y = 0f
            }

            // Ground Rolling Resistance & Wheel Brakes
            if (normalForceN > 0f) {
                val rollingFrictionCoeff = 0.022f
                var effectiveBrakeCoeff = 0f

                if (isParkingBrakeSet) {
                    effectiveBrakeCoeff = 0.50f
                } else if (isWheelBrakesActive) {
                    effectiveBrakeCoeff = if (surfaceY > 0f) 3.50f else 0.40f
                }

                val totalFrictionCoeff = rollingFrictionCoeff + effectiveBrakeCoeff
                brakingForceN = totalFrictionCoeff * normalForceN

                if (groundSpeedMS > 0.05f) {
                    val groundDir = Vector3D(velocity.x, 0f, velocity.z).normalized()
                    val forceGroundFriction = groundDir * (-min(brakingForceN, groundSpeedMS * config.massKg / dt))
                    netForce += forceGroundFriction
                } else {
                    brakingForceN = 0f
                    if (isParkingBrakeSet || isWheelBrakesActive || throttle <= 0.02f) {
                        velocity.x = 0f
                        velocity.z = 0f
                        netForce.x = 0f
                        netForce.z = 0f
                    }
                }
            }

            currentPhase = when {
                groundSpeedKnots < 1.0f && throttle <= 0.05f -> FlightPhase.PARKED_ON_RUNWAY
                groundSpeedKnots < 1.0f && isWheelBrakesActive -> FlightPhase.SAFELY_STOPPED
                pitchDeg() > 4.0f && groundSpeedKnots >= config.rotationSpeedKnots * 0.85f -> FlightPhase.ROTATING
                else -> if (currentPhase == FlightPhase.TOUCHDOWN_ROLLOUT) FlightPhase.TOUCHDOWN_ROLLOUT else FlightPhase.TAKEOFF_ROLL
            }
        } else {
            isOnGround = false
            normalForceN = 0f
            brakingForceN = 0f

            currentPhase = when {
                altitudeFeet < 500f && (verticalSpeedFpm > 200f || isLiftingOff) -> FlightPhase.LIFTOFF_CLIMB
                altitudeFeet < 1500f && verticalSpeedFpm < -200f && isLandingGearDown -> FlightPhase.APPROACH
                else -> FlightPhase.CRUISE
            }
        }

        // 5. NUMERICAL INTEGRATION (LINEAR ACCELERATION & VELOCITY: a = F_net / m)
        val acceleration = netForce / config.massKg
        velocity += acceleration * dt

        if (isOnGround && velocity.y < 0f) {
            if (velocity.y < -0.5f && !isCrashed) {
                velocity.y = -velocity.y * 0.2f
            } else {
                velocity.y = 0f
            }
        }

        position += velocity * dt
        if (position.y < 0f) position.y = 0f

        verticalSpeedFpm = velocity.y * 3.28084f * 60f

        val verticalAcc = (aero.forceLift.dot(upVector) + aero.forceThrust.dot(upVector)) / config.massKg
        gForce = (verticalAcc / 9.81f).coerceIn(config.minG, config.maxG)

        // 6. ROTATIONAL DYNAMICS (TORQUE & MOMENT OF INERTIA INTEGRATION: alpha_rot = Torque / Inertia)
        val dynamicAuthorityFactor = (dynamicPressurePa / 1000f).coerceIn(0.15f, 1.4f)

        if (!isOnGround && isAutopilotEnabled) {
            val twoPi = (2f * PI).toFloat()
            val headingError = (autopilotTargetHeadingRad - yawRad + 3f * PI.toFloat()) % twoPi - PI.toFloat()
            val targetBank = (headingError * 1.2f).coerceIn(-0.52f, 0.52f)
            val rollError = targetBank - rollRad
            rollInput = (rollError * 2.0f).coerceIn(-1f, 1f)
            yawInput = (headingError * 0.3f).coerceIn(-0.5f, 0.5f)

            val altErrorMeters = autopilotTargetAltitudeMeters - position.y
            val targetPitchDeg = (altErrorMeters * 0.05f).coerceIn(-15f, 15f)
            val targetPitchRad = Math.toRadians(targetPitchDeg.toDouble()).toFloat()
            val pitchError = targetPitchRad - pitchRad
            pitchInput = (pitchError * 3.0f - pitchRate * 0.5f).coerceIn(-1f, 1f)
        }

        if (isOnGround) {
            rollRad = 0f
            rollRate = 0f

            // Elevator aerodynamic torque rotates aircraft nose up around main gear when speed approaches Vr
            val rotationAuthority = (airspeedKnots / (config.rotationSpeedKnots * 0.75f)).coerceIn(0f, 1.3f)
            val targetPitchDeg = (pitchInput * 13.0f * rotationAuthority).coerceIn(0f, 14.0f)
            val targetPitchRad = Math.toRadians(targetPitchDeg.toDouble()).toFloat()

            pitchRad += (targetPitchRad - pitchRad) * min(1.0f, dt * 6.5f * rotationAuthority)
            pitchRate = 0f

            // Nosewheel Steering + Rudder torque on ground
            val steerSpeedFactor = (groundSpeedKnots / 25f).coerceIn(0.15f, 1.0f)
            val targetYawRate = yawInput * (config.yawRateMaxRadSec * 0.9f) * steerSpeedFactor
            yawRate += (targetYawRate - yawRate) * min(1.0f, dt * 10.0f)

            if (abs(yawInput) < 0.05f && groundSpeedKnots > 3f) {
                val groundHeadingRad = atan2(velocity.x, velocity.z)
                var diffHeading = groundHeadingRad - yawRad
                if (diffHeading > PI.toFloat()) diffHeading -= 2f * PI.toFloat()
                if (diffHeading < -PI.toFloat()) diffHeading += 2f * PI.toFloat()
                yawRad += diffHeading * min(1.0f, dt * 5.0f)
            }
            lastNetTorqueBody = Vector3D.ZERO
        } else {
            // Compute 3D Aerodynamic & Control Surface Torques (Pitch, Yaw, Roll in N·m)
            val netTorquesNm = Aerodynamics.evaluateTorques(
                dynPressurePa = dynamicPressurePa,
                trueAirspeedMS = speed,
                aoaDeg = angleOfAttackDeg,
                sideslipDeg = sideSlipDeg,
                pitchRateRadSec = pitchRate,
                rollRateRadSec = rollRate,
                yawRateRadSec = yawRate,
                elevatorInput = pitchInput,
                aileronInput = rollInput,
                rudderInput = yawInput,
                isStalling = isStalling,
                config = config
            )
            lastNetTorqueBody = netTorquesNm

            // Angular Acceleration = Torque / MomentOfInertia + Atmospheric Turbulence Angular Accel
            val turbAngAccel = windSystem.currentTurbulenceAngularAccel
            val pitchAngularAccel = (netTorquesNm.x / config.inertiaPitchKgM2) + turbAngAccel.x
            val yawAngularAccel = (netTorquesNm.y / config.inertiaYawKgM2) + turbAngAccel.y
            val rollAngularAccel = (netTorquesNm.z / config.inertiaRollKgM2) + turbAngAccel.z

            pitchRate += pitchAngularAccel * dt
            rollRate += rollAngularAccel * dt
            yawRate += yawAngularAccel * dt

            // Coordinated Bank-to-Turn dynamic: Horizontal component of Lift vector turns heading
            if (speed > 10f && abs(rollRad) > 0.02f) {
                val bankTurnRate = (tan(rollRad.toDouble()).toFloat() * 9.81f / max(15f, speed)).coerceIn(-1.5f, 1.5f)
                yawRate += (bankTurnRate - yawRate) * min(1.0f, dt * 3.5f * dynamicAuthorityFactor)
            }

            // Integrate Euler Angles from Angular Velocities
            pitchRad += pitchRate * dt
            rollRad += rollRate * dt
            yawRad += yawRate * dt

            val maxPitch = Math.toRadians(88.0).toFloat()
            pitchRad = pitchRad.coerceIn(-maxPitch, maxPitch)

            val twoPi = (2f * PI).toFloat()
            if (rollRad > PI.toFloat()) rollRad -= twoPi
            if (rollRad < -PI.toFloat()) rollRad += twoPi
        }

        val twoPi = (2f * PI).toFloat()
        yawRad = (yawRad % twoPi + twoPi) % twoPi

        updateVectors()
        syncStateSnapshot(dt)
    }

    private fun syncStateSnapshot(dtSec: Float) {
        val gearEnum = when {
            gearPosition > 0.95f -> GearState.DOWN
            gearPosition < 0.05f -> GearState.UP
            else -> GearState.TRANSITIONING
        }
        state = AircraftState(
            airspeedMS = airspeedMS,
            airspeedKnots = airspeedKnots,
            trueAirspeedMS = airspeedMS,
            groundSpeedKnots = groundSpeedKnots,
            altitudeMeters = altitudeMeters,
            altitudeFeet = altitudeFeet,
            verticalSpeedMS = velocity.y,
            verticalSpeedFpm = verticalSpeedFpm,
            headingDeg = yawDeg(),
            pitchDeg = pitchDeg(),
            rollDeg = rollDeg(),
            yawDeg = yawDeg(),
            pitchRateDegSec = Math.toDegrees(pitchRate.toDouble()).toFloat(),
            rollRateDegSec = Math.toDegrees(rollRate.toDouble()).toFloat(),
            yawRateDegSec = Math.toDegrees(yawRate.toDouble()).toFloat(),
            angleOfAttackDeg = angleOfAttackDeg,
            sideslipDeg = sideSlipDeg,
            throttle = throttle,
            engineThrustN = thrustN,
            liftForceN = liftN,
            dragForceN = dragN,
            gravityForceN = weightN,
            normalForceN = normalForceN,
            fuelKg = fuelKg,
            fuelCapacityKg = config.fuelCapacityKg,
            flapsPosition = flapsPosition,
            airbrakePosition = airbrakePosition,
            gearState = gearEnum,
            brakeState = isWheelBrakesActive || isParkingBrakeSet,
            stallState = isStalling,
            engineState = engineState,
            airDensityKgM3 = airDensityKgM3,
            dynamicPressurePa = dynamicPressurePa,
            cL = cLCurrent,
            cD = cDCurrent,
            gForce = gForce,
            windVelocityMS = windSystem.currentWindVelocityMS,
            turbulenceIntensity = if (windSystem.isTurbulenceEnabled) windSystem.turbulenceIntensity else 0f,
            netForceWorld = lastAeroForces?.netForce ?: Vector3D.ZERO,
            netTorqueBody = lastNetTorqueBody,
            fps = fps
        )
    }

    fun pitchDeg(): Float = Math.toDegrees(pitchRad.toDouble()).toFloat()
    fun yawDeg(): Float = Math.toDegrees(yawRad.toDouble()).toFloat()
    fun rollDeg(): Float = Math.toDegrees(rollRad.toDouble()).toFloat()
}
