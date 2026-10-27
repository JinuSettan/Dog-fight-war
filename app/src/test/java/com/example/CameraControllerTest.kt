package com.example

import com.example.physics.AerodynamicsEngine
import com.example.physics.AircraftConfig
import com.example.physics.Vector3D
import com.example.render3d.CameraController
import com.example.render3d.CameraMode
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CameraControllerTest {

    @Test
    fun testCameraModesInitialization() {
        val camera = CameraController()
        val physics = AerodynamicsEngine(AircraftConfig.F16_FIGHTER)
        physics.reset(startAltitudeMeters = 1000f, startAirspeedKnots = 250f)

        // Default mode is Chase
        assertEquals(CameraMode.CHASE_CAM, camera.mode)
        assertFalse(camera.isTransitioning)

        camera.update(physics, 1f / 60f)
        assertNotNull(camera.getViewMatrix())
        assertTrue("Camera FOV should scale with speed", camera.fovYDeg >= CameraMode.CHASE_CAM.defaultFov)
    }

    @Test
    fun testSmoothTransitionBetweenChaseAndCockpit() {
        val camera = CameraController()
        val physics = AerodynamicsEngine(AircraftConfig.F16_FIGHTER)
        physics.reset(startAltitudeMeters = 1000f, startAirspeedKnots = 250f)
        camera.update(physics, 1f / 60f)

        // Trigger transition from Chase -> Cockpit
        camera.setCameraMode(CameraMode.COCKPIT_CAM, smooth = true)
        assertTrue("Camera should enter transitioning state", camera.isTransitioning)
        assertEquals(CameraMode.COCKPIT_CAM, camera.mode)

        // Step simulation midway through transition (0.3 seconds)
        for (i in 0 until 18) {
            physics.update(1f / 60f)
            camera.update(physics, 1f / 60f)
        }

        assertTrue("Camera should still be transitioning midway", camera.isTransitioning)
        assertTrue("Transition progress should be between 0 and 1", camera.transitionProgress in 0.01f..0.99f)

        // Step simulation past transition duration (> 0.75 seconds total)
        for (i in 0 until 35) {
            physics.update(1f / 60f)
            camera.update(physics, 1f / 60f)
        }

        assertFalse("Transition should complete after full duration", camera.isTransitioning)
        assertEquals(1.0f, camera.transitionProgress, 0.001f)
        assertTrue("Cockpit view FOV should be active", camera.fovYDeg >= CameraMode.COCKPIT_CAM.defaultFov)
    }

    @Test
    fun testTopDownTacticalViewVectors() {
        val camera = CameraController()
        val physics = AerodynamicsEngine(AircraftConfig.F16_FIGHTER)
        physics.reset(startAltitudeMeters = 500f, startAirspeedKnots = 200f)

        // Switch directly to Top-Down
        camera.setCameraMode(CameraMode.TOP_DOWN_CAM, smooth = false)
        assertEquals(CameraMode.TOP_DOWN_CAM, camera.mode)
        assertFalse(camera.isTransitioning)

        camera.update(physics, 1f / 60f)

        // Eye Y should be significantly above aircraft Y (looking straight down)
        assertTrue("Top-down eye altitude should be higher than aircraft", camera.eye.y > physics.position.y + 50f)
        assertEquals(physics.position.x, camera.target.x, 1.0f)
        assertEquals(physics.position.z, camera.target.z, 1.0f)
        assertEquals(CameraMode.TOP_DOWN_CAM.defaultFov, camera.fovYDeg, 0.1f)
    }

    @Test
    fun testCycleCameraModeOrder() {
        val camera = CameraController()
        camera.setCameraMode(CameraMode.COCKPIT_CAM, smooth = false)

        camera.cycleCameraMode()
        assertEquals(CameraMode.CHASE_CAM, camera.mode)

        camera.cycleCameraMode()
        assertEquals(CameraMode.TOP_DOWN_CAM, camera.mode)

        camera.cycleCameraMode()
        assertEquals(CameraMode.ORBIT_CAM, camera.mode)

        camera.cycleCameraMode()
        assertEquals(CameraMode.COCKPIT_CAM, camera.mode)
    }
}
