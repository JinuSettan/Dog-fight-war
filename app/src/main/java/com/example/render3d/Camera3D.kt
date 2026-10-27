package com.example.render3d

import com.example.physics.AerodynamicsEngine
import com.example.physics.Matrix4
import com.example.physics.Vector3D
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

enum class CameraMode(val label: String, val shortName: String, val defaultFov: Float) {
    COCKPIT_CAM("Cockpit (First-Person)", "COCKPIT", 75f),
    CHASE_CAM("Chase (Third-Person)", "CHASE", 60f),
    TOP_DOWN_CAM("Top-Down (Tactical)", "TOP-DOWN", 48f),
    ORBIT_CAM("3D Orbit", "ORBIT", 60f)
}

/**
 * CameraPose represents the instantaneous 3D transform and FOV of a camera view.
 */
data class CameraPose(
    val eye: Vector3D,
    val target: Vector3D,
    val up: Vector3D,
    val fovDeg: Float
)

/**
 * CameraController manages 3D flight camera perspectives (Cockpit, Chase, Top-Down, Orbit)
 * and orchestrates continuous, smooth transitions and dynamic motion smoothing.
 */
class CameraController {
    var mode: CameraMode = CameraMode.CHASE_CAM
        private set

    // Primary 3D Camera Vectors
    var eye: Vector3D = Vector3D(0f, 1500f, -25f)
    var target: Vector3D = Vector3D(0f, 1500f, 0f)
    var up: Vector3D = Vector3D(0f, 1f, 0f)

    // Current Dynamic Field of View
    var fovYDeg: Float = CameraMode.CHASE_CAM.defaultFov

    // Orbit camera parameters
    var orbitAzimuthDeg: Float = 45f
    var orbitElevationDeg: Float = 20f
    var orbitDistance: Float = 35f

    // Smooth Transition State
    var isTransitioning: Boolean = false
        private set
    var transitionProgress: Float = 1.0f // 0.0 to 1.0
        private set
    private var transitionDurationSec: Float = 0.65f
    private var transitionTimeSec: Float = 0f
    private var fromMode: CameraMode = CameraMode.CHASE_CAM

    // Lag/Smoothing states for steady flight modes
    private var smoothedChaseEye: Vector3D = Vector3D(0f, 1500f, -25f)
    private var smoothedChaseTarget: Vector3D = Vector3D(0f, 1500f, 0f)

    // Top-down camera smooth height
    private var smoothedTopDownDistance: Float = 110f

    /**
     * Switch camera mode with optional smooth transition animation.
     */
    fun setCameraMode(newMode: CameraMode, smooth: Boolean = true) {
        if (newMode == mode && !isTransitioning) return

        if (!smooth) {
            mode = newMode
            isTransitioning = false
            transitionProgress = 1.0f
            fovYDeg = newMode.defaultFov
            return
        }

        // Start smooth transition
        fromMode = mode
        mode = newMode
        isTransitioning = true
        transitionTimeSec = 0f
        transitionProgress = 0f
    }

    /**
     * Legacy setter / property access for mode to maintain backward compatibility.
     */
    fun setMode(newMode: CameraMode) {
        setCameraMode(newMode, smooth = true)
    }

    /**
     * Cycle to the next camera mode in order (Cockpit -> Chase -> Top-Down -> Orbit -> ...)
     */
    fun cycleCameraMode() {
        val modes = CameraMode.entries
        val nextIdx = (modes.indexOf(mode) + 1) % modes.size
        setCameraMode(modes[nextIdx], smooth = true)
    }

    /**
     * Compute instantaneous ideal camera pose for a given mode and aircraft physical state.
     */
    fun computePoseForMode(cameraMode: CameraMode, physics: AerodynamicsEngine): CameraPose {
        val planePos = physics.position
        val forward = physics.forwardVector
        val planeUp = physics.upVector
        val right = physics.rightVector
        val speedRatio = (physics.airspeedKnots / 500f).coerceIn(0f, 1.2f)

        return when (cameraMode) {
            CameraMode.COCKPIT_CAM -> {
                // Cockpit view: positioned at pilot eye point in jet canopy
                // Look along aircraft forward vector, rolling and looping with the jet
                val eyeOffset = (forward * 2.8f) + (planeUp * 1.35f)
                val targetOffset = (forward * 200f) + (planeUp * 1.35f)
                CameraPose(
                    eye = planePos + eyeOffset,
                    target = planePos + targetOffset,
                    up = planeUp,
                    fovDeg = CameraMode.COCKPIT_CAM.defaultFov + speedRatio * 12f
                )
            }

            CameraMode.CHASE_CAM -> {
                // Chase view: positioned behind and slightly above the aircraft
                // Ground-referenced horizon frame with dynamic bank lag for clear roll & pitch perception
                val headingLength = sqrt(forward.x * forward.x + forward.z * forward.z)
                val headingDir = if (headingLength > 0.05f) {
                    Vector3D(forward.x / headingLength, 0f, forward.z / headingLength)
                } else {
                    Vector3D(0f, 0f, 1f)
                }
                
                val altRatio = (physics.altitudeFeet / 20000f).coerceIn(0f, 1f)
                val chaseDistance = 24.0f + (speedRatio * 8.0f) + (altRatio * 4.0f)
                val chaseHeight = 6.2f + (physics.pitchDeg() * 0.08f).coerceIn(-1.5f, 2.5f) + (altRatio * 2.0f)
                
                val chaseOffset = (headingDir * -chaseDistance) + Vector3D(0f, chaseHeight, 0f) - (forward * 2.5f)
                val lookAheadOffset = (forward * 22.0f) + Vector3D(0f, 1.2f, 0f)

                // 20% dynamic roll bank lag against the stable world Up vector
                val chaseUp = Vector3D(0f, 1f, 0f).lerp(planeUp, 0.20f).normalized()

                CameraPose(
                    eye = planePos + chaseOffset,
                    target = planePos + lookAheadOffset,
                    up = if (chaseUp.lengthSquared() > 0.01f) chaseUp else Vector3D(0f, 1f, 0f),
                    fovDeg = CameraMode.CHASE_CAM.defaultFov + speedRatio * 14f
                )
            }

            CameraMode.TOP_DOWN_CAM -> {
                // Top-Down tactical view: high above looking directly down on the aircraft
                val targetDistance = (80f + physics.airspeedMS * 0.4f).coerceIn(75f, 220f)
                val topDownEye = planePos + Vector3D(0f, targetDistance, 0f)
                
                // For Top-Down view, Up vector aligns with aircraft horizontal heading
                val headingZ = forward.z
                val headingX = forward.x
                val headingLen = sqrt(headingX * headingX + headingZ * headingZ)
                val topDownUp = if (headingLen > 0.05f) {
                    Vector3D(headingX / headingLen, 0f, headingZ / headingLen)
                } else {
                    Vector3D(0f, 0f, 1f)
                }

                CameraPose(
                    eye = topDownEye,
                    target = planePos,
                    up = topDownUp,
                    fovDeg = CameraMode.TOP_DOWN_CAM.defaultFov
                )
            }

            CameraMode.ORBIT_CAM -> {
                // 3D Orbit view: spherical coordinates around the aircraft
                val azRad = Math.toRadians(orbitAzimuthDeg.toDouble()).toFloat()
                val elRad = Math.toRadians(orbitElevationDeg.toDouble()).toFloat()

                val offsetX = orbitDistance * cos(elRad) * sin(azRad)
                val offsetY = orbitDistance * sin(elRad)
                val offsetZ = orbitDistance * cos(elRad) * cos(azRad)

                CameraPose(
                    eye = planePos + Vector3D(offsetX, offsetY, offsetZ),
                    target = planePos,
                    up = Vector3D(0f, 1f, 0f),
                    fovDeg = CameraMode.ORBIT_CAM.defaultFov
                )
            }
        }
    }

    /**
     * Frame update method. Updates dynamic smoothing, spring lag, and smooth transitions.
     */
    fun update(physics: AerodynamicsEngine, dtSec: Float) {
        val dt = dtSec.coerceIn(0.001f, 0.1f)

        // Compute current ideal pose for the active mode
        val currentTargetPose = computePoseForMode(mode, physics)

        if (isTransitioning) {
            transitionTimeSec += dt
            val tLinear = (transitionTimeSec / transitionDurationSec).coerceIn(0f, 1f)
            
            // Smooth S-Curve easing (Cubic Hermite smoothstep: 3t^2 - 2t^3)
            val easeT = tLinear * tLinear * (3.0f - 2.0f * tLinear)
            transitionProgress = easeT

            // Compute ideal pose for the previous mode
            val fromPose = computePoseForMode(fromMode, physics)

            // Smoothly interpolate eye position, look target, camera up vector, and FOV
            eye = fromPose.eye.lerp(currentTargetPose.eye, easeT)
            target = fromPose.target.lerp(currentTargetPose.target, easeT)

            val blendedUp = fromPose.up.lerp(currentTargetPose.up, easeT).normalized()
            up = if (blendedUp.lengthSquared() > 0.01f) blendedUp else currentTargetPose.up

            fovYDeg = fromPose.fovDeg + (currentTargetPose.fovDeg - fromPose.fovDeg) * easeT

            // Initialize smoothing buffers to seamless end-state
            smoothedChaseEye = currentTargetPose.eye
            smoothedChaseTarget = currentTargetPose.target

            if (tLinear >= 1.0f) {
                isTransitioning = false
                transitionProgress = 1.0f
            }
        } else {
            transitionProgress = 1.0f
            fovYDeg = currentTargetPose.fovDeg

            when (mode) {
                CameraMode.CHASE_CAM -> {
                    // Dynamic spring damping for realistic chase camera inertia
                    val springDampFactor = (dt * 12.0f).coerceIn(0.08f, 0.95f)
                    smoothedChaseEye = smoothedChaseEye.lerp(currentTargetPose.eye, springDampFactor)
                    smoothedChaseTarget = smoothedChaseTarget.lerp(currentTargetPose.target, springDampFactor)

                    eye = smoothedChaseEye
                    target = smoothedChaseTarget
                    up = currentTargetPose.up
                }

                CameraMode.COCKPIT_CAM -> {
                    // Rigid cockpit camera with subtle high-speed / stall buffeting
                    val buffetAmp = when {
                        physics.isStalling -> 0.06f
                        physics.airspeedKnots > 450f -> (physics.airspeedKnots - 450f) * 0.0001f
                        else -> 0f
                    }
                    val gBuffet = sin(System.currentTimeMillis() * 0.05f) * buffetAmp
                    eye = currentTargetPose.eye + (physics.upVector * gBuffet)
                    target = currentTargetPose.target
                    up = currentTargetPose.up
                }

                CameraMode.TOP_DOWN_CAM -> {
                    // Smooth altitude tracking for tactical top-down view
                    val targetDist = (80f + physics.airspeedMS * 0.4f).coerceIn(75f, 220f)
                    smoothedTopDownDistance += (targetDist - smoothedTopDownDistance) * (dt * 5.0f).coerceIn(0.05f, 0.5f)
                    
                    eye = physics.position + Vector3D(0f, smoothedTopDownDistance, 0f)
                    target = physics.position
                    up = currentTargetPose.up
                }

                CameraMode.ORBIT_CAM -> {
                    eye = currentTargetPose.eye
                    target = currentTargetPose.target
                    up = currentTargetPose.up
                }
            }
        }
    }

    /**
     * Generates standard View Matrix for rendering.
     */
    fun getViewMatrix(): Matrix4 = Matrix4.lookAt(eye, target, up)
}

/**
 * Typealias for full backward compatibility across the codebase.
 */
typealias Camera3D = CameraController

