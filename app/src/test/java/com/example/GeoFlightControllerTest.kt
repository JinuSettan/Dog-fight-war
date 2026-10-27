package com.example

import com.example.map.GeoFlightController
import com.example.map.RealWorldLocation
import com.example.physics.AircraftConfig
import com.example.physics.FlightPhysicsEngine
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class GeoFlightControllerTest {

    @Test
    fun testInitialPositionMatchesLocation() {
        val geo = GeoFlightController(RealWorldLocation.SAN_FRANCISCO)
        assertEquals(RealWorldLocation.SAN_FRANCISCO.latitude, geo.latitude, 0.0001)
        assertEquals(RealWorldLocation.SAN_FRANCISCO.longitude, geo.longitude, 0.0001)
    }

    @Test
    fun testKeralaLocationIsAvailable() {
        val kerala = RealWorldLocation.KERALA_INDIA
        assertNotNull(kerala)
        assertEquals(9.9312, kerala.latitude, 0.001)
        assertEquals(76.2673, kerala.longitude, 0.001)
        assertTrue(RealWorldLocation.ALL_LOCATIONS.contains(kerala))
    }

    @Test
    fun testAircraftMovementUpdatesGPSCoordinates() {
        val physics = FlightPhysicsEngine(AircraftConfig.F16_FIGHTER)
        physics.reset(startAltitudeMeters = 2000f, startAirspeedKnots = 350f)
        val geo = GeoFlightController(RealWorldLocation.SAN_FRANCISCO)

        val initialLat = geo.latitude
        val initialLng = geo.longitude

        // Advance 2 seconds of forward flight
        for (i in 0 until 120) {
            val dt = 1f / 60f
            physics.update(dt)
            geo.update(physics, dt)
        }

        // Lat or Lng should have advanced
        val moved = (geo.latitude != initialLat) || (geo.longitude != initialLng)
        assertTrue("Aircraft movement should continuously update GPS lat/lng", moved)
        assertTrue("Trail history should record flight path", geo.flightPathTrail.size >= 1)
    }

    @Test
    fun testTerrainElevationAndRadarAltitude() {
        val physics = FlightPhysicsEngine(AircraftConfig.F16_FIGHTER)
        physics.reset(startAltitudeMeters = 3000f, startAirspeedKnots = 300f)
        val geo = GeoFlightController(RealWorldLocation.SWISS_ALPS)

        geo.update(physics, 0.1f)
        assertTrue("Terrain elevation should be greater than 0", geo.currentTerrainElevationMeters > 0f)
        assertTrue("Radar altitude should be calculated", geo.radarAltitudeFeet > 0f)
    }

    @Test
    fun testCustomCoordinatesLocation() {
        val geo = GeoFlightController()
        geo.setCustomLocation("Custom Peak", "Himalayas", 28.5, 84.2, 3500f)

        assertEquals(28.5, geo.latitude, 0.001)
        assertEquals(84.2, geo.longitude, 0.001)
        assertEquals("Custom Peak", geo.currentLocation.name)
    }
}
