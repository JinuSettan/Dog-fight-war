package com.example.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.map.GeoFlightController
import com.example.map.GlobalAirportDatabase
import com.example.physics.AerodynamicsEngine
import com.example.render3d.AirportVisualsRenderer
import com.example.render3d.World3D
import kotlin.math.cos
import kotlin.math.sin

@Composable
fun HudOverlay(
    physics: AerodynamicsEngine,
    world: World3D,
    onRestartMission: () -> Unit,
    geoController: GeoFlightController? = null,
    frameTickState: State<Long>,
    isIlsActive: Boolean = true,
    modifier: Modifier = Modifier
) {
    val hudColor = Color(0xFFD0BCFF) // Clean Minimalism Lavender HUD Accent
    val textMeasurer = rememberTextMeasurer()

    // Observe frameTick inside the Canvas to avoid full UI recomposition
    // (Outer read removed for performance)

    Box(modifier = modifier.fillMaxSize()) {
        // DRAWABLE HUD CANVAS
        Canvas(modifier = Modifier.fillMaxSize()) {
            @Suppress("UNUSED_VARIABLE")
            val canvasTick = frameTickState.value

            val w = size.width
            val h = size.height
            val cx = w / 2f
            val cy = h / 2f

            // 1. Center Aircraft Boresight Marker
            drawBoresight(cx, cy, hudColor)

            // 2. Rotating Pitch Ladder
            drawPitchLadder(
                cx = cx,
                cy = cy,
                pitchDeg = physics.pitchDeg(),
                rollRad = physics.rollRad,
                hudColor = hudColor,
                textMeasurer = textMeasurer
            )

            // 3. Airspeed Tape (Left)
            drawAirspeedTape(
                cx = cx - (w * 0.32f),
                cy = cy,
                airspeedKnots = physics.airspeedKnots,
                hudColor = hudColor,
                textMeasurer = textMeasurer
            )

            // 4. Altitude Tape (Right)
            drawAltitudeTape(
                cx = cx + (w * 0.32f),
                cy = cy,
                altitudeFeet = physics.altitudeFeet,
                vsiFpm = physics.verticalSpeedFpm,
                hudColor = hudColor,
                textMeasurer = textMeasurer
            )

            // 5. Heading Compass Tape (Top)
            drawHeadingTape(
                cx = cx,
                topY = h * 0.08f,
                headingDeg = physics.yawDeg(),
                hudColor = hudColor,
                textMeasurer = textMeasurer
            )

            // 6. Flight Systems Annunciator (Top Right / Center)
            drawSystemsStatus(
                rightX = w - 80f,
                topY = h * 0.12f,
                isGearDown = physics.isLandingGearDown,
                isFlaps = physics.isFlapsDeployed,
                isBrakes = physics.isWheelBrakesActive,
                isPBrake = physics.isParkingBrakeSet,
                isSpoiler = physics.isAirbrakeDeployed,
                hudColor = hudColor,
                textMeasurer = textMeasurer
            )

            // 7. Flight Phase & Flight Director Guidance (Center Top)
            drawFlightPhaseGuidance(
                cx = cx,
                topY = h * 0.15f,
                phase = physics.currentPhase,
                airspeed = physics.airspeedKnots,
                vr = physics.config.rotationSpeedKnots,
                vsi = physics.verticalSpeedFpm,
                isGearDown = physics.isLandingGearDown,
                hudColor = hudColor,
                textMeasurer = textMeasurer
            )

            // 7.b ILS Glide Slope & Localizer Guidance (When active)
            if (isIlsActive && geoController != null) {
                drawIlsGuidance(
                    cx = cx,
                    cy = cy,
                    w = w,
                    h = h,
                    geoController = geoController,
                    physics = physics,
                    hudColor = hudColor,
                    textMeasurer = textMeasurer
                )
            }

            // 8. Flight Parameters & Real GPS Telemetry Bar (Bottom HUD)
            val gpsString = if (geoController != null) {
                "3D TERRAIN: %s | LAT: %.4f° LNG: %.4f°".format(
                    geoController.currentLocation.name.uppercase(),
                    geoController.latitude,
                    geoController.longitude
                )
            } else null

            drawTelemetryBar(
                cx = cx,
                bottomY = h * 0.88f,
                alphaDeg = physics.angleOfAttackDeg,
                gForce = physics.gForce,
                mach = physics.airspeedMS / 340f,
                score = world.score,
                phaseName = physics.currentPhase.label,
                gpsTelemetry = gpsString,
                hudColor = hudColor,
                textMeasurer = textMeasurer
            )
        }

        // TOUCHDOWN QUALITY BANNER
        if (physics.landingQualityText != null && !physics.isCrashed) {
            Box(
                modifier = Modifier
                    .align(Alignment.Center)
                    .padding(bottom = 140.dp)
                    .background(Color(0xDD1E293B), RoundedCornerShape(12.dp))
                    .padding(horizontal = 24.dp, vertical = 12.dp)
            ) {
                Text(
                    text = physics.landingQualityText ?: "",
                    color = Color(0xFF4ADE80),
                    fontSize = 16.sp,
                    style = TextStyle(fontSize = 16.sp)
                )
            }
        }

        // TERRAIN PROXIMITY WARNING BANNER (GPWS)
        if (geoController != null && geoController.isTerrainWarning && !physics.isCrashed && !physics.isOnGround) {
            Box(
                modifier = Modifier
                    .align(Alignment.Center)
                    .padding(bottom = 170.dp)
                    .background(Color(0xEEB91C1C), RoundedCornerShape(8.dp))
                    .padding(horizontal = 20.dp, vertical = 10.dp)
                    .testTag("terrain_pull_up_warning")
            ) {
                Text(
                    text = "⚠️ TERRAIN AHEAD! PULL UP! (AGL %.0f FT)".format(geoController.radarAltitudeFeet),
                    color = Color.White,
                    fontWeight = androidx.compose.ui.text.font.FontWeight.Bold,
                    fontSize = 14.sp
                )
            }
        }

        // AUTOPILOT ENGAGED BANNER
        if (physics.isAutopilotEnabled && !physics.isCrashed) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .padding(top = 90.dp)
                    .background(Color(0xDD381E72), RoundedCornerShape(8.dp))
                    .border(1.dp, Color(0xFFD0BCFF), RoundedCornerShape(8.dp))
                    .padding(horizontal = 16.dp, vertical = 6.dp)
                    .testTag("autopilot_engaged_banner")
            ) {
                Text(
                    text = "AP: ENGAGED (HDG %.0f° | ALT %.0f FT)".format(
                        Math.toDegrees(physics.autopilotTargetHeadingRad.toDouble()),
                        physics.autopilotTargetAltitudeMeters * 3.28084f
                    ),
                    color = Color(0xFFD0BCFF),
                    fontWeight = androidx.compose.ui.text.font.FontWeight.Bold,
                    fontSize = 13.sp
                )
            }
        }

        // STALL WARNING BANNER
        if (physics.isStalling && !physics.isCrashed) {
            Box(
                modifier = Modifier
                    .align(Alignment.Center)
                    .padding(bottom = 120.dp)
                    .background(Color(0xDDDC2626), RoundedCornerShape(8.dp))
                    .padding(horizontal = 20.dp, vertical = 10.dp)
            ) {
                Text(
                    text = "⚠️ STALL WARNING! NOSE DOWN / INCREASE POWER",
                    color = Color.White,
                    fontSize = 14.sp,
                    style = TextStyle(fontSize = 14.sp)
                )
            }
        }

        // CRASH SCREEN OVERLAY
        if (physics.isCrashed) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color(0xEE0F172A)),
                contentAlignment = Alignment.Center
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.padding(24.dp)
                ) {
                    Text(
                        text = "AIRCRAFT CRASHED",
                        color = Color(0xFFEF4444),
                        fontSize = 28.sp,
                        style = TextStyle(fontSize = 28.sp)
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = physics.crashReason,
                        color = Color(0xFF94A3B8),
                        fontSize = 14.sp
                    )
                    Spacer(Modifier.height(24.dp))
                    Button(
                        onClick = onRestartMission,
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0EA5E9)),
                        modifier = Modifier.testTag("restart_mission_button")
                    ) {
                        Text("RESTART FLIGHT", color = Color.White)
                    }
                }
            }
        }
    }
}

private fun DrawScope.drawBoresight(cx: Float, cy: Float, color: Color) {
    val size = 20f
    // Reticle center dot and wings
    drawCircle(color = color, radius = 4f, center = Offset(cx, cy))

    drawLine(color, Offset(cx - size * 2f, cy), Offset(cx - size, cy), strokeWidth = 3f)
    drawLine(color, Offset(cx - size, cy), Offset(cx - size, cy + size / 2f), strokeWidth = 3f)

    drawLine(color, Offset(cx + size, cy), Offset(cx + size * 2f, cy), strokeWidth = 3f)
    drawLine(color, Offset(cx + size, cy), Offset(cx + size, cy + size / 2f), strokeWidth = 3f)
}

private fun DrawScope.drawPitchLadder(
    cx: Float,
    cy: Float,
    pitchDeg: Float,
    rollRad: Float,
    hudColor: Color,
    textMeasurer: androidx.compose.ui.text.TextMeasurer
) {
    rotate(degrees = Math.toDegrees(-rollRad.toDouble()).toFloat(), pivot = Offset(cx, cy)) {
        val pixelsPerDeg = 8f
        val pitchStep = 10

        for (deg in -80..80 step pitchStep) {
            if (deg == 0) continue
            val deltaPitch = pitchDeg - deg
            val yPos = cy + (deltaPitch * pixelsPerDeg)

            if (yPos in (cy - 180f)..(cy + 180f)) {
                val ladderWidth = 70f
                val gap = 20f

                // Left ladder bar
                drawLine(hudColor, Offset(cx - ladderWidth, yPos), Offset(cx - gap, yPos), strokeWidth = 2f)
                // Right ladder bar
                drawLine(hudColor, Offset(cx + gap, yPos), Offset(cx + ladderWidth, yPos), strokeWidth = 2f)

                // Degree text
                drawText(
                    textMeasurer = textMeasurer,
                    text = "${if (deg > 0) "+$deg" else "$deg"}",
                    style = TextStyle(color = hudColor, fontSize = 10.sp),
                    topLeft = Offset(cx + ladderWidth + 6f, yPos - 12f)
                )
            }
        }
    }
}

private fun DrawScope.drawAirspeedTape(
    cx: Float,
    cy: Float,
    airspeedKnots: Float,
    hudColor: Color,
    textMeasurer: androidx.compose.ui.text.TextMeasurer
) {
    val tapeWidth = 60f
    val tapeHeight = 220f

    // Background box
    drawRect(
        color = Color(0x33000000),
        topLeft = Offset(cx - tapeWidth / 2f, cy - tapeHeight / 2f),
        size = androidx.compose.ui.geometry.Size(tapeWidth, tapeHeight)
    )
    drawRect(
        color = hudColor,
        topLeft = Offset(cx - tapeWidth / 2f, cy - tapeHeight / 2f),
        size = androidx.compose.ui.geometry.Size(tapeWidth, tapeHeight),
        style = Stroke(width = 1.5f)
    )

    // Ticks every 10 knots
    val pxPerKnot = 2f
    val baseSpd = (airspeedKnots / 10).toInt() * 10
    for (spd in (baseSpd - 50)..(baseSpd + 50) step 10) {
        if (spd < 0) continue
        val yOffset = cy - ((spd - airspeedKnots) * pxPerKnot)
        if (yOffset in (cy - tapeHeight / 2f)..(cy + tapeHeight / 2f)) {
            drawLine(
                color = hudColor,
                start = Offset(cx + tapeWidth / 2f - 12f, yOffset),
                end = Offset(cx + tapeWidth / 2f, yOffset),
                strokeWidth = 2f
            )
            drawText(
                textMeasurer = textMeasurer,
                text = "$spd",
                style = TextStyle(color = hudColor, fontSize = 9.sp),
                topLeft = Offset(cx - tapeWidth / 2f + 4f, yOffset - 10f)
            )
        }
    }

    // Digital readout center indicator
    drawRect(
        color = hudColor,
        topLeft = Offset(cx - tapeWidth / 2f - 10f, cy - 14f),
        size = androidx.compose.ui.geometry.Size(tapeWidth + 10f, 28f)
    )
    drawText(
        textMeasurer = textMeasurer,
        text = "${airspeedKnots.toInt()} KTS",
        style = TextStyle(color = Color(0xFF1C1B1F), fontSize = 11.sp),
        topLeft = Offset(cx - tapeWidth / 2f - 4f, cy - 10f)
    )
}

private fun DrawScope.drawAltitudeTape(
    cx: Float,
    cy: Float,
    altitudeFeet: Float,
    vsiFpm: Float,
    hudColor: Color,
    textMeasurer: androidx.compose.ui.text.TextMeasurer
) {
    val tapeWidth = 65f
    val tapeHeight = 220f

    drawRect(
        color = Color(0x33000000),
        topLeft = Offset(cx - tapeWidth / 2f, cy - tapeHeight / 2f),
        size = androidx.compose.ui.geometry.Size(tapeWidth, tapeHeight)
    )
    drawRect(
        color = hudColor,
        topLeft = Offset(cx - tapeWidth / 2f, cy - tapeHeight / 2f),
        size = androidx.compose.ui.geometry.Size(tapeWidth, tapeHeight),
        style = Stroke(width = 1.5f)
    )

    // Ticks every 100 ft
    val pxPer100Ft = 15f
    val baseAlt = (altitudeFeet / 100).toInt() * 100
    for (alt in (baseAlt - 500)..(baseAlt + 500) step 100) {
        if (alt < 0) continue
        val yOffset = cy - (((alt - altitudeFeet) / 100f) * pxPer100Ft)
        if (yOffset in (cy - tapeHeight / 2f)..(cy + tapeHeight / 2f)) {
            drawLine(
                color = hudColor,
                start = Offset(cx - tapeWidth / 2f, yOffset),
                end = Offset(cx - tapeWidth / 2f + 12f, yOffset),
                strokeWidth = 2f
            )
            drawText(
                textMeasurer = textMeasurer,
                text = "$alt",
                style = TextStyle(color = hudColor, fontSize = 9.sp),
                topLeft = Offset(cx - tapeWidth / 2f + 16f, yOffset - 10f)
            )
        }
    }

    // Digital readout center box
    drawRect(
        color = hudColor,
        topLeft = Offset(cx - tapeWidth / 2f, cy - 14f),
        size = androidx.compose.ui.geometry.Size(tapeWidth + 10f, 28f)
    )
    drawText(
        textMeasurer = textMeasurer,
        text = "${altitudeFeet.toInt()} FT",
        style = TextStyle(color = Color(0xFF1C1B1F), fontSize = 11.sp),
        topLeft = Offset(cx - tapeWidth / 2f + 4f, cy - 10f)
    )
}

private fun DrawScope.drawHeadingTape(
    cx: Float,
    topY: Float,
    headingDeg: Float,
    hudColor: Color,
    textMeasurer: androidx.compose.ui.text.TextMeasurer
) {
    val tapeWidth = 300f

    drawLine(
        color = hudColor,
        start = Offset(cx - tapeWidth / 2f, topY),
        end = Offset(cx + tapeWidth / 2f, topY),
        strokeWidth = 2f
    )

    // Compass Lubber Line Marker
    drawPath(
        path = Path().apply {
            moveTo(cx, topY)
            lineTo(cx - 6f, topY + 10f)
            lineTo(cx + 6f, topY + 10f)
            close()
        },
        color = hudColor
    )

    val pxPerDeg = 4f
    for (hdg in 0..360 step 10) {
        var diff = hdg - headingDeg
        if (diff > 180) diff -= 360
        if (diff < -180) diff += 360

        val xOffset = cx + (diff * pxPerDeg)
        if (xOffset in (cx - tapeWidth / 2f)..(cx + tapeWidth / 2f)) {
            drawLine(
                color = hudColor,
                start = Offset(xOffset, topY),
                end = Offset(xOffset, topY - 8f),
                strokeWidth = 2f
            )

            val label = when (hdg) {
                0, 360 -> "N"
                90 -> "E"
                180 -> "S"
                270 -> "W"
                else -> "${hdg / 10}"
            }

            drawText(
                textMeasurer = textMeasurer,
                text = label,
                style = TextStyle(color = hudColor, fontSize = 10.sp),
                topLeft = Offset(xOffset - 8f, topY - 24f)
            )
        }
    }
}

private fun DrawScope.drawSystemsStatus(
    rightX: Float,
    topY: Float,
    isGearDown: Boolean,
    isFlaps: Boolean,
    isBrakes: Boolean,
    isPBrake: Boolean,
    isSpoiler: Boolean,
    hudColor: Color,
    textMeasurer: androidx.compose.ui.text.TextMeasurer
) {
    val items = listOf(
        Pair("GEAR", if (isGearDown) "DOWN" else "UP"),
        Pair("FLAP", if (isFlaps) "TAKEOFF/LND" else "UP"),
        Pair("BRK", if (isPBrake) "PARK" else if (isBrakes) "ACTIVE" else "OFF"),
        Pair("SPOILER", if (isSpoiler) "DEPLOYED" else "ARMED")
    )

    var currentY = topY
    items.forEach { (label, status) ->
        val activeColor = when (status) {
            "DOWN", "ACTIVE", "PARK", "TAKEOFF/LND", "DEPLOYED" -> Color(0xFF86EFAC)
            else -> hudColor.copy(alpha = 0.6f)
        }

        drawText(
            textMeasurer = textMeasurer,
            text = "$label: $status",
            style = TextStyle(color = activeColor, fontSize = 9.sp),
            topLeft = Offset(rightX - 90f, currentY)
        )
        currentY += 15f
    }
}

private fun DrawScope.drawFlightPhaseGuidance(
    cx: Float,
    topY: Float,
    phase: com.example.physics.FlightPhase,
    airspeed: Float,
    vr: Float,
    vsi: Float,
    isGearDown: Boolean,
    hudColor: Color,
    textMeasurer: androidx.compose.ui.text.TextMeasurer
) {
    val (instruction, promptColor) = when (phase) {
        com.example.physics.FlightPhase.PARKED_ON_RUNWAY -> 
            Pair("TAKEOFF: RELEASE BRAKE & ADVANCE THROTTLE", Color(0xFFFDE047))
        com.example.physics.FlightPhase.TAKEOFF_ROLL -> 
            if (airspeed < vr) Pair("TAKEOFF ROLL: ACCELERATE TO Vr (%.0f KTS)".format(vr), hudColor)
            else Pair("⚡ ROTATE NOW! PULL BACK ON STICK (Vr %.0f KTS)".format(vr), Color(0xFF4ADE80))
        com.example.physics.FlightPhase.ROTATING -> 
            Pair("ROTATING -> GENERATING LIFT FOR LIFTOFF", Color(0xFF4ADE80))
        com.example.physics.FlightPhase.LIFTOFF_CLIMB -> 
            Pair(if (isGearDown) "POSITIVE CLIMB -> RETRACT GEAR" else "CLIMBING ON HEADING", Color(0xFF86EFAC))
        com.example.physics.FlightPhase.APPROACH -> 
            Pair("APPROACH: FLARE BEFORE TOUCHDOWN (SINK < 500 FPM)", Color(0xFFFDE047))
        com.example.physics.FlightPhase.TOUCHDOWN_ROLLOUT -> 
            Pair("ROLLOUT: APPLY WHEEL BRAKES & AIRBRAKE", Color(0xFF60A5FA))
        com.example.physics.FlightPhase.SAFELY_STOPPED -> 
            Pair("✅ TOUCHDOWN COMPLETE - AIRCRAFT STOPPED", Color(0xFF4ADE80))
        com.example.physics.FlightPhase.CRUISE -> 
            Pair("CRUISE FLIGHT - 6-DOF AERODYNAMICS ACTIVE", hudColor.copy(alpha = 0.8f))
        com.example.physics.FlightPhase.CRASHED -> 
            Pair("CRASHED", Color(0xFFEF4444))
    }

    drawText(
        textMeasurer = textMeasurer,
        text = instruction,
        style = TextStyle(color = promptColor, fontSize = 11.sp),
        topLeft = Offset(cx - 180f, topY)
    )
}

private fun DrawScope.drawTelemetryBar(
    cx: Float,
    bottomY: Float,
    alphaDeg: Float,
    gForce: Float,
    mach: Float,
    score: Int,
    phaseName: String,
    gpsTelemetry: String?,
    hudColor: Color,
    textMeasurer: androidx.compose.ui.text.TextMeasurer
) {
    val infoText = "PHASE: %s | α: %.1f° | G: %.1f | M: %.2f | SCORE: %d".format(phaseName.uppercase(), alphaDeg, gForce, mach, score)
    drawText(
        textMeasurer = textMeasurer,
        text = infoText,
        style = TextStyle(color = hudColor, fontSize = 11.sp),
        topLeft = Offset(cx - 200f, bottomY)
    )

    if (gpsTelemetry != null) {
        drawText(
            textMeasurer = textMeasurer,
            text = gpsTelemetry,
            style = TextStyle(color = hudColor.copy(alpha = 0.85f), fontSize = 10.sp),
            topLeft = Offset(cx - 160f, bottomY + 18f)
        )
    }
}

private val ilsHelper = AirportVisualsRenderer()

private fun DrawScope.drawIlsGuidance(
    cx: Float,
    cy: Float,
    w: Float,
    h: Float,
    geoController: GeoFlightController,
    physics: AerodynamicsEngine,
    hudColor: Color,
    textMeasurer: androidx.compose.ui.text.TextMeasurer
) {
    val nearestAirport = GlobalAirportDatabase.airports.minByOrNull { apt ->
        val dLat = apt.latitude - geoController.latitude
        val dLng = apt.longitude - geoController.longitude
        dLat * dLat + dLng * dLng
    }
    val aptLat = nearestAirport?.latitude ?: geoController.currentLocation.latitude
    val aptLng = nearestAirport?.longitude ?: geoController.currentLocation.longitude
    val rwyHeading = nearestAirport?.runwayHeadingDeg ?: 120f
    val aptName = nearestAirport?.name ?: geoController.currentLocation.name

    val ils = ilsHelper.calculateIlsData(
        airportLat = aptLat,
        airportLng = aptLng,
        currentLat = geoController.latitude,
        currentLng = geoController.longitude,
        planePos = physics.position,
        runwayHeadingDeg = rwyHeading,
        airportName = aptName
    )

    if (!ils.hasIlsSignal) return

    // 1. ILS Tactical Annunciator Panel (Top Left HUD)
    val panelLeft = 24f
    val panelTop = h * 0.12f
    val panelWidth = 190f
    val panelHeight = 62f

    drawRect(
        color = Color(0x990F172A),
        topLeft = Offset(panelLeft, panelTop),
        size = androidx.compose.ui.geometry.Size(panelWidth, panelHeight)
    )
    drawRect(
        color = ils.guidanceColor.copy(alpha = 0.7f),
        topLeft = Offset(panelLeft, panelTop),
        size = androidx.compose.ui.geometry.Size(panelWidth, panelHeight),
        style = Stroke(width = 1.5f)
    )

    drawText(
        textMeasurer = textMeasurer,
        text = "ILS • ${ils.runwayIdent} (3.0° GS)",
        style = TextStyle(color = Color(0xFF00E5FF), fontSize = 10.sp),
        topLeft = Offset(panelLeft + 8f, panelTop + 6f)
    )
    drawText(
        textMeasurer = textMeasurer,
        text = "DME: %.1f NM | HDG: %03.0f°".format(ils.distanceNm, ils.runwayHeadingDeg),
        style = TextStyle(color = hudColor, fontSize = 9.sp),
        topLeft = Offset(panelLeft + 8f, panelTop + 22f)
    )
    drawText(
        textMeasurer = textMeasurer,
        text = "▶ ${ils.guidanceMessage}",
        style = TextStyle(color = ils.guidanceColor, fontSize = 10.sp),
        topLeft = Offset(panelLeft + 8f, panelTop + 40f)
    )

    // 2. Glide Slope Deviation Scale & Needle (Vertical scale to the right of attitude ladder)
    val gsScaleX = cx + 180f
    val gsScaleY = cy
    val gsScaleHeight = 120f

    // Vertical scale centerline and dots
    drawLine(
        color = hudColor.copy(alpha = 0.4f),
        start = Offset(gsScaleX, gsScaleY - gsScaleHeight / 2f),
        end = Offset(gsScaleX, gsScaleY + gsScaleHeight / 2f),
        strokeWidth = 1.5f
    )
    // Center dot (on GS)
    drawCircle(color = Color.White, radius = 2.5f, center = Offset(gsScaleX, gsScaleY))
    // +/- 1 dot (approx 0.35 deg)
    drawCircle(color = hudColor.copy(alpha = 0.5f), radius = 2f, center = Offset(gsScaleX, gsScaleY - 25f))
    drawCircle(color = hudColor.copy(alpha = 0.5f), radius = 2f, center = Offset(gsScaleX, gsScaleY + 25f))
    // +/- 2 dot (approx 0.7 deg)
    drawCircle(color = hudColor.copy(alpha = 0.5f), radius = 2f, center = Offset(gsScaleX, gsScaleY - 50f))
    drawCircle(color = hudColor.copy(alpha = 0.5f), radius = 2f, center = Offset(gsScaleX, gsScaleY + 50f))

    // Glide Slope Deviation Diamond Indicator (Moving Needle)
    // Positive gsDevDeg means aircraft is above GS, so GS needle is below center (Fly Down)
    val gsOffsetY = ((-ils.glideSlopeDeviationDeg / 0.7f) * 50f).coerceIn(-55f, 55f)
    val diamondY = gsScaleY + gsOffsetY
    val dSize = 6f
    val gsDiamondPath = Path().apply {
        moveTo(gsScaleX, diamondY - dSize)
        lineTo(gsScaleX + dSize, diamondY)
        lineTo(gsScaleX, diamondY + dSize)
        lineTo(gsScaleX - dSize, diamondY)
        close()
    }
    drawPath(gsDiamondPath, color = ils.guidanceColor)
    drawPath(gsDiamondPath, color = Color.White, style = Stroke(width = 1.2f))

    // 3. Localizer Deviation Scale & Needle (Horizontal scale below attitude center)
    val locScaleX = cx
    val locScaleY = cy + 140f
    val locScaleWidth = 140f

    drawLine(
        color = hudColor.copy(alpha = 0.4f),
        start = Offset(locScaleX - locScaleWidth / 2f, locScaleY),
        end = Offset(locScaleX + locScaleWidth / 2f, locScaleY),
        strokeWidth = 1.5f
    )
    drawCircle(color = Color.White, radius = 2.5f, center = Offset(locScaleX, locScaleY))
    drawCircle(color = hudColor.copy(alpha = 0.5f), radius = 2f, center = Offset(locScaleX - 30f, locScaleY))
    drawCircle(color = hudColor.copy(alpha = 0.5f), radius = 2f, center = Offset(locScaleX + 30f, locScaleY))
    drawCircle(color = hudColor.copy(alpha = 0.5f), radius = 2f, center = Offset(locScaleX - 60f, locScaleY))
    drawCircle(color = hudColor.copy(alpha = 0.5f), radius = 2f, center = Offset(locScaleX + 60f, locScaleY))

    // Localizer Deviation Diamond Indicator
    val locOffsetX = ((-ils.localizerDeviationDeg / 2.0f) * 60f).coerceIn(-65f, 65f)
    val diamondX = locScaleX + locOffsetX
    val locDiamondPath = Path().apply {
        moveTo(diamondX, locScaleY - dSize)
        lineTo(diamondX + dSize, locScaleY)
        lineTo(diamondX, locScaleY + dSize)
        lineTo(diamondX - dSize, locScaleY)
        close()
    }
    drawPath(locDiamondPath, color = ils.guidanceColor)
    drawPath(locDiamondPath, color = Color.White, style = Stroke(width = 1.2f))
}


