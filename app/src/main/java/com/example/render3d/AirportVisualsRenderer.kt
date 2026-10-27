package com.example.render3d

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import com.example.physics.Matrix4
import com.example.physics.Vector3D
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.math.tan

data class IlsApproachData(
    val hasIlsSignal: Boolean,
    val airportName: String,
    val runwayIdent: String,
    val runwayHeadingDeg: Float,
    val distanceNm: Float,
    val distanceMeters: Float,
    val localizerDeviationDeg: Float,
    val glideSlopeDeviationDeg: Float,
    val isLocalizerCaptured: Boolean,
    val isGlideSlopeCaptured: Boolean,
    val guidanceMessage: String,
    val guidanceColor: Color
)

class AirportVisualsRenderer {

    /**
     * Calculates the current Instrument Landing System (ILS) Localizer & Glide Slope telemetry
     */
    fun calculateIlsData(
        airportLat: Double,
        airportLng: Double,
        currentLat: Double,
        currentLng: Double,
        planePos: Vector3D,
        runwayHeadingDeg: Float,
        airportName: String = "INTERNATIONAL AIRPORT"
    ): IlsApproachData {
        val dLat = (currentLat - airportLat) * 111_000.0
        val dLng = (currentLng - airportLng) * 111_000.0 * cos(Math.toRadians(airportLat))
        val distToAirportMeters = sqrt(dLat * dLat + dLng * dLng).toFloat()

        if (distToAirportMeters > 40000f) {
            return IlsApproachData(
                hasIlsSignal = false,
                airportName = airportName,
                runwayIdent = "RWY %02d".format(((runwayHeadingDeg / 10f).toInt() % 36).let { if (it == 0) 36 else it }),
                runwayHeadingDeg = runwayHeadingDeg,
                distanceNm = distToAirportMeters * 0.000539957f,
                distanceMeters = distToAirportMeters,
                localizerDeviationDeg = 0f,
                glideSlopeDeviationDeg = 0f,
                isLocalizerCaptured = false,
                isGlideSlopeCaptured = false,
                guidanceMessage = "OUT OF ILS RANGE",
                guidanceColor = Color(0xFF94A3B8)
            )
        }

        val worldCenterX = dLng.toFloat()
        val worldCenterZ = (-dLat).toFloat()
        val runwayAlt = 0f

        val headingRad = Math.toRadians(runwayHeadingDeg.toDouble()).toFloat()
        val cosH = cos(headingRad)
        val sinH = sin(headingRad)

        val dirX = sinH
        val dirZ = cosH
        val perpX = -dirZ
        val perpZ = dirX

        val runwayHalfLen = 2000f
        val rStart = Vector3D(worldCenterX + dirX * (-runwayHalfLen), runwayAlt, worldCenterZ + dirZ * (-runwayHalfLen))
        val touchdownPoint = Vector3D(rStart.x + dirX * 300f, runwayAlt, rStart.z + dirZ * 300f)

        val outX = -dirX
        val outZ = -dirZ

        val toPlaneX = planePos.x - touchdownPoint.x
        val toPlaneZ = planePos.z - touchdownPoint.z

        val planeDistAlongAppr = toPlaneX * outX + toPlaneZ * outZ
        val planeLatOffset = toPlaneX * perpX + toPlaneZ * perpZ

        val gsSlope = tan(Math.toRadians(3.0)).toFloat()
        val idealAlt = runwayAlt + 15f + planeDistAlongAppr.coerceAtLeast(0f) * gsSlope
        val altDiff = planePos.y - idealAlt

        val effectiveDist = planeDistAlongAppr.coerceAtLeast(100f)
        val locDevDeg = (Math.toDegrees(atan2(planeLatOffset.toDouble(), effectiveDist.toDouble()))).toFloat()
        val gsDevDeg = (Math.toDegrees(atan2(altDiff.toDouble(), effectiveDist.toDouble()))).toFloat()

        val isLocCaptured = kotlin.math.abs(locDevDeg) < 1.2f
        val isGsCaptured = kotlin.math.abs(gsDevDeg) < 0.4f

        val (msg, col) = when {
            planeDistAlongAppr < -500f -> Pair("RUNWAY PASSED", Color(0xFF94A3B8))
            isLocCaptured && isGsCaptured -> Pair("ON GLIDESLOPE - PERFECT", Color(0xFF22C55E))
            isLocCaptured && gsDevDeg > 0.4f -> Pair("FLY DOWN (HIGH)", Color(0xFFF59E0B))
            isLocCaptured && gsDevDeg < -0.4f -> Pair("FLY UP (LOW)", Color(0xFFEF4444))
            locDevDeg > 1.2f -> Pair("CORRECT LEFT (LOC)", Color(0xFF38BDF8))
            locDevDeg < -1.2f -> Pair("CORRECT RIGHT (LOC)", Color(0xFF38BDF8))
            else -> Pair("INTERCEPT ILS GS", Color(0xFF00E5FF))
        }

        val rwyNum = ((runwayHeadingDeg / 10f).toInt() % 36).let { if (it == 0) 36 else it }

        return IlsApproachData(
            hasIlsSignal = true,
            airportName = airportName,
            runwayIdent = "RWY %02d".format(rwyNum),
            runwayHeadingDeg = runwayHeadingDeg,
            distanceNm = distToAirportMeters * 0.000539957f,
            distanceMeters = distToAirportMeters,
            localizerDeviationDeg = locDevDeg,
            glideSlopeDeviationDeg = gsDevDeg,
            isLocalizerCaptured = isLocCaptured,
            isGlideSlopeCaptured = isGsCaptured,
            guidanceMessage = msg,
            guidanceColor = col
        )
    }

    fun drawAirportDetails(
        drawScope: DrawScope,
        viewProj: Matrix4,
        w: Float,
        h: Float,
        airportLat: Double,
        airportLng: Double,
        currentLat: Double,
        currentLng: Double,
        planePos: Vector3D,
        runwayHeadingDeg: Float,
        isLowLightMode: Boolean = false,
        isIlsActive: Boolean = true
    ) {
        // Approximate distance check in meters (1 deg lat ~ 111,000m)
        val dLat = (currentLat - airportLat) * 111_000.0
        val dLng = (currentLng - airportLng) * 111_000.0 * cos(Math.toRadians(airportLat))
        val distToAirportMeters = sqrt(dLat * dLat + dLng * dLng)

        // Only render detailed airport structures when within 35,000 meters (35km) of the airport or in low-light mode
        if (distToAirportMeters > 35000.0 && !isLowLightMode && !isIlsActive) return

        // Airport center in local 3D world coordinates relative to aircraft
        val worldCenterX = (dLng).toFloat()
        val worldCenterZ = (-dLat).toFloat() // North is -Z in this renderer convention
        val runwayAlt = 0f

        val headingRad = Math.toRadians(runwayHeadingDeg.toDouble()).toFloat()
        val cosH = cos(headingRad)
        val sinH = sin(headingRad)

        // Runway Direction Vectors
        val dirX = sinH
        val dirZ = cosH
        val perpX = -dirZ
        val perpZ = dirX

        // 1. Draw Runway Strip (~4000m long, 60m wide)
        val runwayHalfLen = 2000f
        val runwayHalfWidth = 30f

        val rStart = Vector3D(worldCenterX + dirX * (-runwayHalfLen), runwayAlt, worldCenterZ + dirZ * (-runwayHalfLen))
        val rEnd = Vector3D(worldCenterX + dirX * runwayHalfLen, runwayAlt, worldCenterZ + dirZ * runwayHalfLen)
        val touchdownPoint = Vector3D(rStart.x + dirX * 300f, runwayAlt, rStart.z + dirZ * 300f)

        // Runway 4 corners for asphalt polygon rendering or outline
        val corner1 = Vector3D(rStart.x + perpX * runwayHalfWidth, runwayAlt, rStart.z + perpZ * runwayHalfWidth)
        val corner2 = Vector3D(rStart.x - perpX * runwayHalfWidth, runwayAlt, rStart.z - perpZ * runwayHalfWidth)
        val corner3 = Vector3D(rEnd.x - perpX * runwayHalfWidth, runwayAlt, rEnd.z - perpZ * runwayHalfWidth)
        val corner4 = Vector3D(rEnd.x + perpX * runwayHalfWidth, runwayAlt, rEnd.z + perpZ * runwayHalfWidth)

        val pc1 = project3D(corner1, viewProj, w, h)
        val pc2 = project3D(corner2, viewProj, w, h)
        val pc3 = project3D(corner3, viewProj, w, h)
        val pc4 = project3D(corner4, viewProj, w, h)

        if (pc1 != null && pc2 != null && pc3 != null && pc4 != null) {
            val runwayPath = Path().apply {
                moveTo(pc1.x, pc1.y)
                lineTo(pc2.x, pc2.y)
                lineTo(pc3.x, pc3.y)
                lineTo(pc4.x, pc4.y)
                close()
            }
            // Draw dark asphalt runway fill so it renders correctly on satellite base map
            drawScope.drawPath(runwayPath, color = Color(0xCC1E293B))
            drawScope.drawPath(runwayPath, color = Color(0xFF64748B), style = Stroke(width = 2f))
        }

        val p1 = project3D(rStart, viewProj, w, h)
        val p2 = project3D(rEnd, viewProj, w, h)

        if (p1 != null && p2 != null) {
            // Draw runway centerline
            drawScope.drawLine(
                color = Color(0xFFFACC15), // Yellow centerline
                start = Offset(p1.x, p1.y),
                end = Offset(p2.x, p2.y),
                strokeWidth = 3f
            )
        }

        // PROCEDURAL RUNWAY LIGHTING SYSTEM (Activates when near airport or during low-light conditions)
        val isLightingActive = distToAirportMeters < 25000.0 || isLowLightMode
        if (isLightingActive) {
            // A. Runway Edge Lights & Centerline Lights (Procedural spacing every 300m)
            val numSegments = 14
            for (i in 0..numSegments) {
                val t = i / numSegments.toFloat()
                val segX = rStart.x + (rEnd.x - rStart.x) * t
                val segZ = rStart.z + (rEnd.z - rStart.z) * t

                val leftPos = Vector3D(segX + perpX * runwayHalfWidth, runwayAlt, segZ + perpZ * runwayHalfWidth)
                val rightPos = Vector3D(segX - perpX * runwayHalfWidth, runwayAlt, segZ - perpZ * runwayHalfWidth)

                val pLeft = project3D(leftPos, viewProj, w, h)
                val pRight = project3D(rightPos, viewProj, w, h)

                // Edge light color: White along runway, Amber/Yellow in the final 600m caution zone
                val edgeColor = if (t > 0.85f) Color(0xFFF59E0B) else Color(0xFFFFFFFF)
                val glowColor = if (t > 0.85f) Color(0x66F59E0B) else Color(0x66FFFFFF)

                if (pLeft != null && pLeft.zEye > 0f) {
                    val radius = (12f / (pLeft.zEye + 1.0f)).coerceIn(2f, 8f)
                    // Outer glow halo for satellite map contrast
                    drawScope.drawCircle(color = glowColor, radius = radius * 2.2f, center = Offset(pLeft.x, pLeft.y))
                    // Inner bright core light
                    drawScope.drawCircle(color = edgeColor, radius = radius, center = Offset(pLeft.x, pLeft.y))
                }

                if (pRight != null && pRight.zEye > 0f) {
                    val radius = (12f / (pRight.zEye + 1.0f)).coerceIn(2f, 8f)
                    drawScope.drawCircle(color = glowColor, radius = radius * 2.2f, center = Offset(pRight.x, pRight.y))
                    drawScope.drawCircle(color = edgeColor, radius = radius, center = Offset(pRight.x, pRight.y))
                }
            }

            // B. Threshold Lights (Green at arrival threshold rStart)
            for (j in -3..3) {
                if (j == 0) continue
                val offsetDist = (j * (runwayHalfWidth / 3f))
                val threshPos = Vector3D(rStart.x + perpX * offsetDist, runwayAlt, rStart.z + perpZ * offsetDist)
                val pThresh = project3D(threshPos, viewProj, w, h)
                if (pThresh != null && pThresh.zEye > 0f) {
                    val r = (14f / (pThresh.zEye + 1.0f)).coerceIn(3f, 9f)
                    drawScope.drawCircle(color = Color(0x6622C55E), radius = r * 2.5f, center = Offset(pThresh.x, pThresh.y))
                    drawScope.drawCircle(color = Color(0xFF22C55E), radius = r, center = Offset(pThresh.x, pThresh.y))
                }
            }

            // C. Runway End / Departure Lights (Red at far end rEnd)
            for (j in -3..3) {
                if (j == 0) continue
                val offsetDist = (j * (runwayHalfWidth / 3f))
                val endPos = Vector3D(rEnd.x + perpX * offsetDist, runwayAlt, rEnd.z + perpZ * offsetDist)
                val pEndLight = project3D(endPos, viewProj, w, h)
                if (pEndLight != null && pEndLight.zEye > 0f) {
                    val r = (14f / (pEndLight.zEye + 1.0f)).coerceIn(3f, 9f)
                    drawScope.drawCircle(color = Color(0x66EF4444), radius = r * 2.5f, center = Offset(pEndLight.x, pEndLight.y))
                    drawScope.drawCircle(color = Color(0xFFEF4444), radius = r, center = Offset(pEndLight.x, pEndLight.y))
                }
            }

            // D. PAPI (Precision Approach Path Indicator) 4-Light Visual System beside runway
            drawPapiLights(drawScope, viewProj, w, h, touchdownPoint, perpX, perpZ, runwayHalfWidth, planePos)
        }

        // 2. High-Intensity Approach Lighting System (ALS) on ground leading to threshold
        drawGroundApproachLights(drawScope, viewProj, w, h, rStart, -dirX, -dirZ, perpX, perpZ)

        // 3. 3D VOLUMETRIC ILS GLIDE SLOPE VISUAL INDICATOR (3.0° Precision Approach Path)
        if (isIlsActive) {
            draw3dIlsGlideSlopeCorridor(
                drawScope = drawScope,
                viewProj = viewProj,
                w = w,
                h = h,
                rStart = rStart,
                touchdownPoint = touchdownPoint,
                outX = -dirX,
                outZ = -dirZ,
                perpX = perpX,
                perpZ = perpZ,
                runwayAlt = runwayAlt,
                planePos = planePos
            )
        }

        // 4. Terminal Building & Control Tower near airport
        val terminalPos = Vector3D(worldCenterX + 300f, runwayAlt, worldCenterZ + 200f)
        val towerPos = Vector3D(worldCenterX + 350f, runwayAlt, worldCenterZ - 100f)

        val pTerm = project3D(terminalPos, viewProj, w, h)
        val pTower = project3D(towerPos, viewProj, w, h)

        if (pTerm != null && pTerm.zEye > 0f) {
            val termSize = (120f / (pTerm.zEye + 1.0f)).coerceIn(4f, 150f)
            drawScope.drawRect(
                color = Color(0x99334155),
                topLeft = Offset(pTerm.x - termSize, pTerm.y - termSize * 0.5f),
                size = androidx.compose.ui.geometry.Size(termSize * 2f, termSize)
            )
            drawScope.drawRect(
                color = Color(0xFF94A3B8),
                topLeft = Offset(pTerm.x - termSize, pTerm.y - termSize * 0.5f),
                size = androidx.compose.ui.geometry.Size(termSize * 2f, termSize),
                style = Stroke(width = 1.5f)
            )
        }

        if (pTower != null && pTower.zEye > 0f) {
            val towerHeight = (180f / (pTower.zEye + 1.0f)).coerceIn(8f, 200f)
            drawScope.drawLine(
                color = Color(0xFFE2E8F0),
                start = Offset(pTower.x, pTower.y),
                end = Offset(pTower.x, pTower.y - towerHeight),
                strokeWidth = 4f
            )
            // Control Tower Rotating / Pulsing Beacon Light
            val beaconPulse = if (isLightingActive) ((System.currentTimeMillis() % 1200L) / 1200f) else 0.5f
            val beaconColor = if (beaconPulse > 0.5f) Color(0xFF38BDF8) else Color(0xFFF59E0B)
            drawScope.drawCircle(
                color = beaconColor.copy(alpha = 0.4f),
                radius = towerHeight * 0.4f,
                center = Offset(pTower.x, pTower.y - towerHeight)
            )
            drawScope.drawCircle(
                color = beaconColor,
                radius = towerHeight * 0.25f,
                center = Offset(pTower.x, pTower.y - towerHeight)
            )
        }
    }

    /**
     * Draws the 3D ILS Glide Slope visual indicator corridor, gates, target crosshairs, and stanchions
     */
    private fun draw3dIlsGlideSlopeCorridor(
        drawScope: DrawScope,
        viewProj: Matrix4,
        w: Float,
        h: Float,
        rStart: Vector3D,
        touchdownPoint: Vector3D,
        outX: Float,
        outZ: Float,
        perpX: Float,
        perpZ: Float,
        runwayAlt: Float,
        planePos: Vector3D
    ) {
        // Standard 3.0° glide slope (tan(3°) ~ 0.052408)
        val gsSlope = tan(Math.toRadians(3.0)).toFloat()
        val thresholdCrossingHeight = 15f // 50ft above threshold

        // Plane deviation calculation for dynamic color feedback
        val toPlaneX = planePos.x - touchdownPoint.x
        val toPlaneZ = planePos.z - touchdownPoint.z
        val planeDistAlongAppr = toPlaneX * outX + toPlaneZ * outZ
        val idealAltAtPlane = runwayAlt + thresholdCrossingHeight + planeDistAlongAppr.coerceAtLeast(0f) * gsSlope
        val altDiff = planePos.y - idealAltAtPlane

        // Approach gates from 400m to 12,000m out
        val gateDistances = floatArrayOf(
            400f, 800f, 1300f, 1900f, 2600f, 3400f, 4300f, 5300f, 6400f, 7600f, 9000f, 10600f, 12400f
        )

        // Sequenced "Rabbit" approach strobe wave (travels forward towards runway)
        val waveTime = (System.currentTimeMillis() % 1200L) / 1200f
        val activeWaveIndex = ((1.0f - waveTime) * (gateDistances.size + 2)).toInt()

        data class ProjectedGate(
            val center: Point2D,
            val left: Point2D,
            val right: Point2D,
            val ground: Point2D,
            val distance: Float,
            val isHighlighted: Boolean,
            val gateColor: Color,
            val glowColor: Color
        )

        val projectedGates = ArrayList<ProjectedGate>()

        for (i in gateDistances.indices) {
            val dist = gateDistances[i]
            val gateAltitude = runwayAlt + thresholdCrossingHeight + (dist * gsSlope)

            // Gate center in 3D world space
            val gateCenterX = rStart.x + outX * dist
            val gateCenterZ = rStart.z + outZ * dist
            val gateCenterPos = Vector3D(gateCenterX, gateAltitude, gateCenterZ)

            // Tapered gate width (widens smoothly with distance)
            val halfWidth = (22f + dist * 0.012f).coerceIn(22f, 130f)
            val leftPos = Vector3D(gateCenterX - perpX * halfWidth, gateAltitude, gateCenterZ - perpZ * halfWidth)
            val rightPos = Vector3D(gateCenterX + perpX * halfWidth, gateAltitude, gateCenterZ + perpZ * halfWidth)
            val groundPos = Vector3D(gateCenterX, runwayAlt, gateCenterZ)

            val pCenter = project3D(gateCenterPos, viewProj, w, h)
            val pLeft = project3D(leftPos, viewProj, w, h)
            val pRight = project3D(rightPos, viewProj, w, h)
            val pGround = project3D(groundPos, viewProj, w, h)

            if (pCenter != null && pLeft != null && pRight != null && pGround != null && pCenter.zEye > 0f) {
                val isWaveActive = (i == activeWaveIndex || i == activeWaveIndex - 1)

                // Dynamic ILS Color Feedback based on alignment
                val (baseCol, glowCol) = when {
                    isWaveActive -> Pair(Color(0xFFFFFFFF), Color(0x9900E5FF))
                    kotlin.math.abs(altDiff) <= 25f -> Pair(Color(0xFF00E5FF), Color(0x6600E5FF)) // On Glide Slope (Cyan)
                    altDiff > 25f -> Pair(Color(0xFFF59E0B), Color(0x66F59E0B)) // High (Amber - Fly Down)
                    else -> Pair(Color(0xFFEF4444), Color(0x66EF4444)) // Low (Red - Fly Up)
                }

                projectedGates.add(
                    ProjectedGate(
                        center = pCenter,
                        left = pLeft,
                        right = pRight,
                        ground = pGround,
                        distance = dist,
                        isHighlighted = isWaveActive,
                        gateColor = baseCol,
                        glowColor = glowCol
                    )
                )
            }
        }

        // 1. Draw Continuous 3D Glide Slope Guide Rails (Left rail, Right rail, and Centerline)
        if (projectedGates.size >= 2) {
            for (i in 0 until projectedGates.size - 1) {
                val g1 = projectedGates[i]
                val g2 = projectedGates[i + 1]

                // Left corridor rail
                drawScope.drawLine(
                    color = g1.glowColor,
                    start = Offset(g1.left.x, g1.left.y),
                    end = Offset(g2.left.x, g2.left.y),
                    strokeWidth = 2.5f
                )

                // Right corridor rail
                drawScope.drawLine(
                    color = g1.glowColor,
                    start = Offset(g1.right.x, g1.right.y),
                    end = Offset(g2.right.x, g2.right.y),
                    strokeWidth = 2.5f
                )

                // Central 3.0° Glide Slope baseline beam
                drawScope.drawLine(
                    color = Color(0x5500E5FF),
                    start = Offset(g1.center.x, g1.center.y),
                    end = Offset(g2.center.x, g2.center.y),
                    strokeWidth = 1.8f,
                    pathEffect = PathEffect.dashPathEffect(floatArrayOf(12f, 8f), 0f)
                )
            }
        }

        // 2. Draw Each ILS Light Gate, Alignment Diamonds, and Vertical Ground Stanchions
        // Render from furthest to closest
        projectedGates.sortedByDescending { it.center.zEye }.forEach { gate ->
            val pC = gate.center
            val pL = gate.left
            val pR = gate.right
            val pG = gate.ground

            val zFactor = (1.0f / (pC.zEye + 1.0f))
            val markerRadius = (16f * zFactor).coerceIn(3.5f, 14f)
            val stanchionAlpha = (0.45f * (1.0f - (gate.distance / 14000f))).coerceIn(0.1f, 0.5f)

            // A. Vertical Ground Light Stanchion (connects gate down to terrain/satellite base)
            drawScope.drawLine(
                color = gate.gateColor.copy(alpha = stanchionAlpha),
                start = Offset(pC.x, pC.y),
                end = Offset(pG.x, pG.y),
                strokeWidth = 1.5f
            )

            // Ground base anchor glow
            drawScope.drawCircle(
                color = gate.glowColor.copy(alpha = 0.35f),
                radius = markerRadius * 1.5f,
                center = Offset(pG.x, pG.y)
            )

            // B. Horizontal Gate Crossbar Bracket (Left to Right)
            drawScope.drawLine(
                color = gate.glowColor,
                start = Offset(pL.x, pL.y),
                end = Offset(pR.x, pR.y),
                strokeWidth = if (gate.isHighlighted) 3.5f else 2.0f
            )

            // C. Left and Right Light Wickets
            // Left light
            drawScope.drawCircle(color = gate.glowColor, radius = markerRadius * 2.2f, center = Offset(pL.x, pL.y))
            drawScope.drawCircle(color = gate.gateColor, radius = markerRadius, center = Offset(pL.x, pL.y))

            // Right light
            drawScope.drawCircle(color = gate.glowColor, radius = markerRadius * 2.2f, center = Offset(pR.x, pR.y))
            drawScope.drawCircle(color = gate.gateColor, radius = markerRadius, center = Offset(pR.x, pR.y))

            // D. Center Glide Slope Target Reticle / Diamond Light Marker
            val dSize = markerRadius * 1.6f
            val diamondPath = Path().apply {
                moveTo(pC.x, pC.y - dSize)
                lineTo(pC.x + dSize, pC.y)
                lineTo(pC.x, pC.y + dSize)
                lineTo(pC.x - dSize, pC.y)
                close()
            }

            // Outer glow halo
            drawScope.drawCircle(color = gate.glowColor, radius = markerRadius * 2.5f, center = Offset(pC.x, pC.y))
            // Diamond reticle
            drawScope.drawPath(diamondPath, color = gate.gateColor)
            drawScope.drawPath(diamondPath, color = Color.White, style = Stroke(width = 1.5f))

            // Alignment crosshair ticks at center
            val tickLen = markerRadius * 1.2f
            drawScope.drawLine(Color.White, Offset(pC.x - tickLen * 2f, pC.y), Offset(pC.x - tickLen, pC.y), strokeWidth = 2f)
            drawScope.drawLine(Color.White, Offset(pC.x + tickLen, pC.y), Offset(pC.x + tickLen * 2f, pC.y), strokeWidth = 2f)
        }
    }

    /**
     * Draws High-Intensity Approach Lighting System (ALS / MALSR) extending 900m out on the ground
     */
    private fun drawGroundApproachLights(
        drawScope: DrawScope,
        viewProj: Matrix4,
        w: Float,
        h: Float,
        rStart: Vector3D,
        outX: Float,
        outZ: Float,
        perpX: Float,
        perpZ: Float
    ) {
        val numBars = 15 // Spaced every 60m out to 900m
        val rabbitTime = (System.currentTimeMillis() % 1000L) / 1000f
        val activeRabbitIndex = ((1.0f - rabbitTime) * numBars).toInt()

        for (i in 1..numBars) {
            val dist = i * 60f
            val barCenterX = rStart.x + outX * dist
            val barCenterZ = rStart.z + outZ * dist

            val isDecisionBar = (i == 5) // 300m / 1000ft Decision Bar
            val barHalfWidth = if (isDecisionBar) 15f else 6f
            val isRabbit = (i == activeRabbitIndex)

            val pCenter = project3D(Vector3D(barCenterX, 0f, barCenterZ), viewProj, w, h)
            val pLeft = project3D(Vector3D(barCenterX - perpX * barHalfWidth, 0f, barCenterZ - perpZ * barHalfWidth), viewProj, w, h)
            val pRight = project3D(Vector3D(barCenterX + perpX * barHalfWidth, 0f, barCenterZ + perpZ * barHalfWidth), viewProj, w, h)

            if (pCenter != null && pLeft != null && pRight != null && pCenter.zEye > 0f) {
                val rad = (10f / (pCenter.zEye + 1.0f)).coerceIn(2f, 6f)

                val barColor = if (isRabbit) Color(0xFFFFFFFF) else if (isDecisionBar) Color(0xFFF1F5F9) else Color(0xDDFFFFFF)
                val glowColor = if (isRabbit) Color(0x9938BDF8) else Color(0x55FFFFFF)

                // Draw horizontal light barrette
                drawScope.drawLine(
                    color = barColor,
                    start = Offset(pLeft.x, pLeft.y),
                    end = Offset(pRight.x, pRight.y),
                    strokeWidth = if (isDecisionBar || isRabbit) 3f else 1.8f
                )

                // Center rabbit strobe flash
                if (isRabbit) {
                    drawScope.drawCircle(color = glowColor, radius = rad * 3f, center = Offset(pCenter.x, pCenter.y))
                    drawScope.drawCircle(color = Color.White, radius = rad * 1.5f, center = Offset(pCenter.x, pCenter.y))
                }
            }
        }
    }

    /**
     * Draws PAPI (Precision Approach Path Indicator) 4-Light Visual System beside runway
     */
    private fun drawPapiLights(
        drawScope: DrawScope,
        viewProj: Matrix4,
        w: Float,
        h: Float,
        touchdownPoint: Vector3D,
        perpX: Float,
        perpZ: Float,
        runwayHalfWidth: Float,
        planePos: Vector3D
    ) {
        val papiOffsetSide = runwayHalfWidth + 18f
        val papiCenterX = touchdownPoint.x - perpX * papiOffsetSide
        val papiCenterZ = touchdownPoint.z - perpZ * papiOffsetSide

        // Calculate approach angle to touchdown point in degrees
        val dX = planePos.x - touchdownPoint.x
        val dZ = planePos.z - touchdownPoint.z
        val horizDist = sqrt(dX * dX + dZ * dZ)
        val apprAngleDeg = Math.toDegrees(atan2(planePos.y.toDouble(), horizDist.toDouble().coerceAtLeast(10.0))).toFloat()

        // PAPI standard light transition angles:
        // > 3.5°: 4 White (Too High)
        // 3.2° - 3.5°: 3 White, 1 Red (Slightly High)
        // 2.8° - 3.2°: 2 White, 2 Red (On 3.0° Glide Slope)
        // 2.5° - 2.8°: 1 White, 3 Red (Slightly Low)
        // < 2.5°: 4 Red (Too Low)
        val numWhite = when {
            apprAngleDeg > 3.5f -> 4
            apprAngleDeg > 3.15f -> 3
            apprAngleDeg >= 2.85f -> 2
            apprAngleDeg >= 2.5f -> 1
            else -> 0
        }

        val whiteCol = Color(0xFFFFFFFF)
        val redCol = Color(0xFFEF4444)

        for (k in 0..3) {
            val lightOffset = (k - 1.5f) * 4.5f
            val lPos = Vector3D(papiCenterX - perpX * lightOffset, 0f, papiCenterZ - perpZ * lightOffset)
            val pLight = project3D(lPos, viewProj, w, h)

            if (pLight != null && pLight.zEye > 0f) {
                val r = (12f / (pLight.zEye + 1.0f)).coerceIn(2.5f, 7f)
                val isLightWhite = (k < numWhite)
                val c = if (isLightWhite) whiteCol else redCol
                val g = if (isLightWhite) Color(0x66FFFFFF) else Color(0x66EF4444)

                drawScope.drawCircle(color = g, radius = r * 2.2f, center = Offset(pLight.x, pLight.y))
                drawScope.drawCircle(color = c, radius = r, center = Offset(pLight.x, pLight.y))
            }
        }
    }

    private fun project3D(v: Vector3D, viewProj: Matrix4, width: Float, height: Float): Point2D? {
        val clip = viewProj.transformVector(v)
        if (clip.z < -1.0f || clip.z > 1.0f) return null
        val screenX = (clip.x + 1.0f) * 0.5f * width
        val screenY = (1.0f - clip.y) * 0.5f * height
        return Point2D(screenX, screenY, clip.z)
    }

    private data class Point2D(val x: Float, val y: Float, val zEye: Float)
}

