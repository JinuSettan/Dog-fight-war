package com.example.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Layers
import androidx.compose.material.icons.filled.Navigation
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.map.GeoFlightController
import com.example.physics.AerodynamicsEngine
import com.google.maps.android.compose.MapType
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

/**
 * Tactical Real-World Minimap & Radar Navigation HUD Display.
 * Renders GPS coordinates, aircraft heading vector, terrain contour rings,
 * flight path history trail, and waypoint navigation.
 */
@Composable
fun MinimapView(
    physics: AerodynamicsEngine,
    geoController: GeoFlightController,
    currentMapType: MapType = MapType.SATELLITE,
    frameTickState: State<Long>,
    remotePlayers: List<com.example.data.MultiplayerPlayerData> = emptyList(),
    currentUserId: String = "",
    modifier: Modifier = Modifier
) {
    var isExpanded by remember { mutableStateOf(false) }
    var rangeNm by remember { mutableFloatStateOf(10f) }

    val sizeDp = if (isExpanded) 220.dp else 140.dp

    Surface(
        shape = RoundedCornerShape(18.dp),
        color = Color(0xDD0F172A),
        modifier = modifier
            .size(sizeDp)
            .border(1.5.dp, Color(0xFF38BDF8), RoundedCornerShape(18.dp))
            .testTag("tactical_minimap_view")
    ) {
        Box(modifier = Modifier.fillMaxSize()) {
            // Tactical Vector Radar Canvas
            Canvas(
                modifier = Modifier
                    .fillMaxSize()
                    .clip(RoundedCornerShape(18.dp))
                    .testTag("minimap_radar_canvas")
            ) {
                @Suppress("UNUSED_VARIABLE")
                val tick = frameTickState.value

                val cx = size.width / 2f
                val cy = size.height / 2f
                val maxRadius = minOf(cx, cy) * 0.88f

                // 1. Radar background sweep gradient
                drawCircle(
                    brush = Brush.radialGradient(
                        colors = listOf(Color(0xFF0F172A), Color(0xFF020617)),
                        center = Offset(cx, cy),
                        radius = maxRadius
                    ),
                    radius = maxRadius,
                    center = Offset(cx, cy)
                )

                // 2. Tactical Range Rings (Inner, Mid, Outer)
                drawCircle(
                    color = Color(0x3338BDF8),
                    radius = maxRadius * 0.33f,
                    center = Offset(cx, cy),
                    style = Stroke(width = 1f)
                )
                drawCircle(
                    color = Color(0x5538BDF8),
                    radius = maxRadius * 0.66f,
                    center = Offset(cx, cy),
                    style = Stroke(width = 1f)
                )
                drawCircle(
                    color = Color(0xAA38BDF8),
                    radius = maxRadius,
                    center = Offset(cx, cy),
                    style = Stroke(width = 1.5f)
                )

                // 3. Cardinal Compass Tick Marks & Azimuth Reticle
                val headingDeg = geoController.cameraBearingDegrees
                val headingRad = (headingDeg - 90f) * PI.toFloat() / 180f

                val ticks = 12
                for (i in 0 until ticks) {
                    val angle = i * (2f * PI.toFloat() / ticks)
                    val r1 = maxRadius - 6f
                    val r2 = maxRadius
                    val x1 = cx + cos(angle) * r1
                    val y1 = cy + sin(angle) * r1
                    val x2 = cx + cos(angle) * r2
                    val y2 = cy + sin(angle) * r2
                    drawLine(
                        color = if (i % 3 == 0) Color(0xFF38BDF8) else Color(0x6638BDF8),
                        start = Offset(x1, y1),
                        end = Offset(x2, y2),
                        strokeWidth = if (i % 3 == 0) 2f else 1f
                    )
                }

                // 4. Flight Path Polyline Trail
                val trail = geoController.flightPathTrail
                if (trail.size >= 2) {
                    val trailPath = Path()
                    val currentLat = geoController.latitude
                    val currentLng = geoController.longitude
                    val metersPerNm = 1852f
                    val scaleMetersToPx = (maxRadius / (rangeNm * metersPerNm))

                    val metersPerDegLat = 111_000f
                    val metersPerDegLng = (111_000f * cos(currentLat * PI / 180.0)).toFloat()

                    var first = true
                    for (pt in trail) {
                        val dLatMeters = (pt.first - currentLat).toFloat() * metersPerDegLat
                        val dLngMeters = (pt.second - currentLng).toFloat() * metersPerDegLng

                        // Rotate relative to aircraft heading so up is track
                        val trackRad = -headingDeg * PI.toFloat() / 180f
                        val rotX = dLngMeters * cos(trackRad) - dLatMeters * sin(trackRad)
                        val rotY = dLngMeters * sin(trackRad) + dLatMeters * cos(trackRad)

                        val px = cx + rotX * scaleMetersToPx
                        val py = cy - rotY * scaleMetersToPx

                        if (first) {
                            trailPath.moveTo(px, py)
                            first = false
                        } else {
                            trailPath.lineTo(px, py)
                        }
                    }

                    drawPath(
                        path = trailPath,
                        color = Color(0xCC38BDF8),
                        style = Stroke(width = 2.5f)
                    )
                }

                // 5. Runway Location Marker (Relative to Airfield Origin)
                val dRunwayLatMeters = (geoController.currentLocation.latitude - geoController.latitude).toFloat() * 111_000f
                val dRunwayLngMeters = (geoController.currentLocation.longitude - geoController.longitude).toFloat() * 111_000f * cos(geoController.latitude * PI / 180.0).toFloat()
                val trackRad = -headingDeg * PI.toFloat() / 180f
                val rwx = cx + (dRunwayLngMeters * cos(trackRad) - dRunwayLatMeters * sin(trackRad)) * (maxRadius / (rangeNm * 1852f))
                val rwy = cy - (dRunwayLngMeters * sin(trackRad) + dRunwayLatMeters * cos(trackRad)) * (maxRadius / (rangeNm * 1852f))

                // 5.b Draw Remote Online Players on Radar Canvas
                val currentLat = geoController.latitude
                val currentLng = geoController.longitude
                remotePlayers.forEach { player ->
                    if (player.uid.isBlank() || player.uid == currentUserId) return@forEach
                    val dLatM = (player.lat - currentLat).toFloat() * 111_000f
                    val dLngM = (player.lon - currentLng).toFloat() * 111_000f * cos(currentLat * PI / 180.0).toFloat()
                    val trkRad = -headingDeg * PI.toFloat() / 180f
                    val rx = cx + (dLngM * cos(trkRad) - dLatM * sin(trkRad)) * (maxRadius / (rangeNm * 1852f))
                    val ry = cy - (dLngM * sin(trkRad) + dLatM * cos(trkRad)) * (maxRadius / (rangeNm * 1852f))

                    val distFromCenter = kotlin.math.sqrt((rx - cx) * (rx - cx) + (ry - cy) * (ry - cy))
                    if (distFromCenter < maxRadius) {
                        drawCircle(
                            color = Color(0xFFEF4444), // Coral Red enemy/player blip
                            radius = 5f,
                            center = Offset(rx, ry)
                        )
                        drawCircle(
                            color = Color(0x66EF4444),
                            radius = 10f,
                            center = Offset(rx, ry),
                            style = Stroke(1.5f)
                        )
                    }
                }

                // 6. Ownship Jet Center Marker (Boresight & Heading vector)
                drawCircle(
                    color = Color(0xFF4ADE80),
                    radius = 4f,
                    center = Offset(cx, cy)
                )
                drawLine(
                    color = Color(0xFF4ADE80),
                    start = Offset(cx, cy),
                    end = Offset(cx, cy - 20f),
                    strokeWidth = 2.5f
                )
                // Wing bars
                drawLine(
                    color = Color(0xFF4ADE80),
                    start = Offset(cx - 10f, cy - 6f),
                    end = Offset(cx + 10f, cy - 6f),
                    strokeWidth = 2f
                )
            }

            // Top-Left: Location Name & Coordinates
            Column(
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(6.dp)
                    .background(Color(0xBB0F172A), RoundedCornerShape(8.dp))
                    .padding(horizontal = 6.dp, vertical = 2.dp)
            ) {
                Text(
                    text = geoController.currentLocation.name.take(16).uppercase(),
                    color = Color(0xFF38BDF8),
                    fontWeight = FontWeight.Bold,
                    fontSize = 9.sp
                )
                Text(
                    text = "%.3f°, %.3f°".format(geoController.latitude, geoController.longitude),
                    color = Color(0xFFE2E8F0),
                    fontSize = 8.sp
                )
                Text(
                    text = "RNG: %.0f NM".format(rangeNm),
                    color = Color(0xFF94A3B8),
                    fontSize = 8.sp
                )
            }

            // Bottom-Right Controls: Range +/- and Expand
            Column(
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(4.dp),
                verticalArrangement = Arrangement.spacedBy(2.dp)
            ) {
                // Zoom / Range In
                Box(
                    modifier = Modifier
                        .size(22.dp)
                        .clip(CircleShape)
                        .background(Color(0xDD1E293B))
                        .clickable { rangeNm = (rangeNm * 0.65f).coerceAtLeast(2f) },
                    contentAlignment = Alignment.Center
                ) {
                    Icon(Icons.Default.Add, contentDescription = "Range In", tint = Color.White, modifier = Modifier.size(14.dp))
                }

                // Zoom / Range Out
                Box(
                    modifier = Modifier
                        .size(22.dp)
                        .clip(CircleShape)
                        .background(Color(0xDD1E293B))
                        .clickable { rangeNm = (rangeNm * 1.5f).coerceAtMost(50f) },
                    contentAlignment = Alignment.Center
                ) {
                    Icon(Icons.Default.Remove, contentDescription = "Range Out", tint = Color.White, modifier = Modifier.size(14.dp))
                }

                // Expand / Collapse Minimap
                Box(
                    modifier = Modifier
                        .size(22.dp)
                        .clip(CircleShape)
                        .background(Color(0xDD0284C7))
                        .clickable { isExpanded = !isExpanded },
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        if (isExpanded) Icons.Default.Close else Icons.Default.Layers,
                        contentDescription = "Expand",
                        tint = Color.White,
                        modifier = Modifier.size(12.dp)
                    )
                }
            }
        }
    }
}
