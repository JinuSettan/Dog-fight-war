package com.example.map

import com.example.physics.AerodynamicsEngine
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

class GeoFlightController(
    initialLocation: RealWorldLocation = RealWorldLocation.PACIFIC_OCEAN_CARRIER
) {
    var currentLocation: RealWorldLocation = initialLocation
        private set

    // Current geographic position
    var latitude: Double = initialLocation.latitude
    var longitude: Double = initialLocation.longitude
    var altitudeMeters: Float = initialLocation.baseElevationMeters + 1000f

    // Current Ground Terrain Elevation (MSL in meters)
    var currentTerrainElevationMeters: Float = initialLocation.baseElevationMeters
        private set

    // Radar Altitude (Altitude above ground level / AGL in feet)
    var radarAltitudeFeet: Float = 3280f
        private set

    // Terrain Proximity Alert (True if approaching terrain rapidly)
    var isTerrainWarning: Boolean = false
        private set

    // Waypoint trail history (for drawing flight path on real map)
    val flightPathTrail = mutableListOf<Pair<Double, Double>>()
    private val maxTrailPoints = 300

    // Earth constant
    private val metersPerDegreeLat = 111_000.0

    // Camera parameters
    var cameraTiltDegrees: Float = 67.5f
    var cameraZoomLevel: Float = 15.5f
    var cameraBearingDegrees: Float = 0f

    fun resetToLocation(location: RealWorldLocation, startAltitudeMeters: Float? = null) {
        currentLocation = location
        latitude = location.latitude
        longitude = location.longitude
        altitudeMeters = startAltitudeMeters ?: (location.baseElevationMeters + 1000f)
        currentTerrainElevationMeters = getEstimatedTerrainElevation(latitude, longitude)
        radarAltitudeFeet = (altitudeMeters - currentTerrainElevationMeters).coerceAtLeast(0f) * 3.28084f
        isTerrainWarning = false
        flightPathTrail.clear()
        flightPathTrail.add(Pair(latitude, longitude))
    }

    fun setCustomLocation(name: String, region: String, lat: Double, lng: Double, baseElevation: Float = 50f) {
        val customLoc = RealWorldLocation(
            name = name,
            region = region,
            latitude = lat,
            longitude = lng,
            baseElevationMeters = baseElevation,
            description = "Custom flight area at coordinates %.4f°, %.4f°".format(lat, lng),
            recommendedAltitudeFeet = 4000f,
            terrainMaxHeightMeters = 1500f
        )
        resetToLocation(customLoc)
    }

    fun update(physics: AerodynamicsEngine, dtSec: Float) {
        // 1. Calculate heading in degrees from physics yaw (0 = North, 90 = East)
        var headingDeg = (physics.yawRad * 180f / PI.toFloat()) % 360f
        if (headingDeg < 0f) headingDeg += 360f
        cameraBearingDegrees = headingDeg

        // 2. Convert ground speed and heading into Lat/Lng displacements
        val groundSpeedMS = physics.velocity.length() * cos(physics.pitchRad.toDouble()).toFloat()
        val headingRad = physics.yawRad.toDouble()

        // Velocity components (North = +Z in 3D physics, East = +X)
        val northVelocityMS = groundSpeedMS * cos(headingRad)
        val eastVelocityMS = groundSpeedMS * sin(headingRad)

        val dLat = (northVelocityMS * dtSec) / metersPerDegreeLat
        val metersPerDegreeLng = metersPerDegreeLat * cos(latitude * PI / 180.0)
        val dLng = (eastVelocityMS * dtSec) / metersPerDegreeLng

        latitude += dLat
        longitude += dLng

        // 3. Update altitude from physics position Y relative to location base elevation
        altitudeMeters = currentLocation.baseElevationMeters + physics.position.y

        // 4. Update real-world terrain elevation & radar altitude
        currentTerrainElevationMeters = getEstimatedTerrainElevation(latitude, longitude)
        val aglMeters = altitudeMeters - currentTerrainElevationMeters
        radarAltitudeFeet = (aglMeters * 3.28084f).coerceAtLeast(0f)

        // 5. Terrain Warning: If flying at high speed close to mountain terrain and sinking
        isTerrainWarning = !physics.isOnGround && 
                (radarAltitudeFeet < 400f || (radarAltitudeFeet < 800f && physics.verticalSpeedFpm < -1200f))

        // 6. Update trail history (add point every ~30 meters moved)
        val lastPoint = flightPathTrail.lastOrNull()
        if (lastPoint == null) {
            flightPathTrail.add(Pair(latitude, longitude))
        } else {
            val dLatDist = (latitude - lastPoint.first) * metersPerDegreeLat
            val dLngDist = (longitude - lastPoint.second) * metersPerDegreeLat
            val distMeters = sqrt(dLatDist * dLatDist + dLngDist * dLngDist)
            if (distMeters > 30.0) {
                flightPathTrail.add(Pair(latitude, longitude))
                if (flightPathTrail.size > maxTrailPoints) {
                    flightPathTrail.removeAt(0)
                }
            }
        }

        // 7. Dynamic Camera Zoom based on altitude above ground
        // Keeping zoom values artificially high at higher altitudes forces the Google Maps
        // SDK to stream maximum "4K-style" high-resolution satellite imagery tiles and 3D terrain.
        val altAboveGroundMeters = physics.position.y
        cameraZoomLevel = when {
            altAboveGroundMeters < 150f -> 18.5f
            altAboveGroundMeters < 600f -> 17.5f
            altAboveGroundMeters < 2000f -> 16.5f
            altAboveGroundMeters < 5000f -> 15.5f
            else -> 14.5f
        }

        // 8. Camera tilt (tilt higher when climbing/low altitude for 3D horizon view)
        val pitchDeg = physics.pitchRad * 180f / PI.toFloat()
        cameraTiltDegrees = (67.5f - pitchDeg * 0.5f).coerceIn(45f, 67.5f)
    }

    fun getEstimatedTerrainElevation(lat: Double, lng: Double): Float {
        // Synthesizes geographic terrain elevation profile relative to location landmarks
        val dLat = (lat - currentLocation.latitude) * 111_000.0
        val dLng = (lng - currentLocation.longitude) * 111_000.0
        val distFromCenter = sqrt(dLat * dLat + dLng * dLng)

        val valleyWave = sin(distFromCenter / 1500.0) * cos(distFromCenter / 800.0)
        val peakWave = sin(dLat / 600.0) * sin(dLng / 600.0)

        val heightVariation = (valleyWave * (currentLocation.terrainMaxHeightMeters * 0.25) + 
                peakWave * (currentLocation.terrainMaxHeightMeters * 0.35)).toFloat()
        return (currentLocation.baseElevationMeters + heightVariation).coerceAtLeast(0f)
    }
}
