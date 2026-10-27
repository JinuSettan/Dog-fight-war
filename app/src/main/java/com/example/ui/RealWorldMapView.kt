package com.example.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Public
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.map.GeoFlightController
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.MapProperties
import com.google.maps.android.compose.MapType
import com.google.maps.android.compose.MapUiSettings
import com.google.maps.android.compose.Polyline
import com.google.maps.android.compose.rememberCameraPositionState
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive

/**
 * Isolated Real-World Google Maps Layer.
 * Decoupled from the 60 FPS Compose rendering loop to completely prevent UI thread blocking
 * and tile churn. Camera updates are throttled at a steady ~5-7 Hz rate.
 */
@Composable
fun RealWorldMapLayer(
    geoController: GeoFlightController,
    mapType: MapType,
    modifier: Modifier = Modifier
) {
    val initialLatLng = remember {
        LatLng(geoController.latitude, geoController.longitude)
    }

    val cameraPositionState = rememberCameraPositionState {
        position = CameraPosition(
            initialLatLng,
            geoController.cameraZoomLevel,
            geoController.cameraTiltDegrees,
            geoController.cameraBearingDegrees
        )
    }

    val mapProperties = remember(mapType) {
        MapProperties(
            mapType = MapType.SATELLITE,
            isBuildingEnabled = false,
            isIndoorEnabled = false,
            isMyLocationEnabled = false,
            isTrafficEnabled = false
        )
    }

    val mapUiSettings = remember {
        MapUiSettings(
            zoomControlsEnabled = false,
            compassEnabled = false,
            tiltGesturesEnabled = false,
            rotationGesturesEnabled = false,
            scrollGesturesEnabled = false,
            zoomGesturesEnabled = false,
            myLocationButtonEnabled = false,
            mapToolbarEnabled = false
        )
    }

    // Polyline trail updated at throttled intervals
    var trailCoordinates by remember { mutableStateOf<List<LatLng>>(emptyList()) }

    // Controlled, throttled background camera sync loop (~4 Hz = 250ms)
    LaunchedEffect(geoController) {
        // Initial delay allowing Android 14+ SurfaceSyncGroup and WindowManager to finalize
        // the initial window/surface attachment transaction before beginning updates
        delay(600L)

        var lastLat = geoController.latitude
        var lastLng = geoController.longitude
        var lastBearing = geoController.cameraBearingDegrees
        var lastZoom = geoController.cameraZoomLevel
        var lastTilt = geoController.cameraTiltDegrees
        var tickCount = 0

        while (isActive) {
            val curLat = geoController.latitude
            val curLng = geoController.longitude
            val curBearing = geoController.cameraBearingDegrees
            val curZoom = geoController.cameraZoomLevel
            val curTilt = geoController.cameraTiltDegrees

            val dLat = kotlin.math.abs(curLat - lastLat)
            val dLng = kotlin.math.abs(curLng - lastLng)
            val dBearing = kotlin.math.abs(curBearing - lastBearing)
            val dZoom = kotlin.math.abs(curZoom - lastZoom)
            val dTilt = kotlin.math.abs(curTilt - lastTilt)

            // Only update camera if significant movement has occurred
            if (dLat > 0.00005 || dLng > 0.00005 || dBearing > 1.0f || dZoom > 0.1f || dTilt > 1.0f) {
                lastLat = curLat
                lastLng = curLng
                lastBearing = curBearing
                lastZoom = curZoom
                lastTilt = curTilt

                try {
                    // Use move() instead of continuous animate().
                    // Continuous animate() spins up an unyielding animator loop in the SurfaceView renderer,
                    // which starves SurfaceSyncGroup transactions and causes 1000ms timeout warnings.
                    cameraPositionState.move(
                        com.google.android.gms.maps.CameraUpdateFactory.newCameraPosition(
                            CameraPosition(
                                LatLng(curLat, curLng),
                                curZoom,
                                curTilt,
                                curBearing
                            )
                        )
                    )
                } catch (_: Exception) {
                    // Safe camera transition catch
                }
            }

            // Update polyline trail every ~1.25 seconds (5 ticks)
            tickCount++
            if (tickCount >= 5) {
                tickCount = 0
                val trail = geoController.flightPathTrail
                if (trail.size >= 2) {
                    trailCoordinates = trail.map { LatLng(it.first, it.second) }
                }
            }

            delay(250L) // Steady 4 Hz throttle gives Google Maps ample time to stream tiles and sync surfaces
        }
    }

    Box(modifier = modifier.fillMaxSize().testTag("real_world_map_container")) {
        // 1. Google Maps Platform Native View
        GoogleMap(
            modifier = Modifier.fillMaxSize().testTag("google_map_view"),
            cameraPositionState = cameraPositionState,
            properties = mapProperties,
            uiSettings = mapUiSettings,
            googleMapOptionsFactory = {
                com.google.android.gms.maps.GoogleMapOptions().zOrderOnTop(false)
            }
        ) {
            // Throttled Flight Path Polyline trailing jet over real terrain
            if (trailCoordinates.size >= 2) {
                Polyline(
                    points = trailCoordinates,
                    color = Color(0xFF38BDF8),
                    width = 6f
                )
            }
        }

        // 2. Discreet Map Platform Status Pill (Bottom Center)
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 8.dp)
                .background(Color(0x991C1B1F), RoundedCornerShape(12.dp))
                .padding(horizontal = 10.dp, vertical = 3.dp)
                .testTag("map_status_indicator")
        ) {
            @Suppress("UNUSED_VARIABLE")
            val trigger = trailCoordinates.size // Trigger recomposition every ~1s

            Icon(
                Icons.Default.Public,
                contentDescription = "Map Platform",
                tint = Color(0xFF38BDF8),
                modifier = Modifier.size(12.dp)
            )
            Spacer(Modifier.width(4.dp))
            Text(
                text = "GOOGLE MAPS 3D | %s | %.3f°, %.3f°".format(
                    geoController.currentLocation.name.uppercase(),
                    geoController.latitude,
                    geoController.longitude
                ),
                color = Color(0xFFE2E8F0),
                fontSize = 9.sp
            )
        }
    }
}
