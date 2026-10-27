package com.example.render3d

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.nativeCanvas
import com.example.physics.AerodynamicsEngine
import com.example.physics.FlightPhase
import com.example.physics.Matrix4
import com.example.physics.Vector3D
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.asin
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.math.tan

class Renderer3D {
    var fovYDeg: Float = 60f
    var nearPlane: Float = 1.0f
    var farPlane: Float = 150000.0f

    private val ambientBirdSystem = AmbientBirdSystem()
    private val airportVisualsRenderer = AirportVisualsRenderer()

    // Procedural volumetric cloud layer data structure
    private data class VolumetricCloud(
        val initialX: Float,
        val altitude: Float,
        val initialZ: Float,
        val stratum: Int, // 0: low cumulus (650-1050m), 1: mid stratocumulus (1600-2300m), 2: high cirrus (3000-4200m)
        val scale: Float
    )

    private val volumetricClouds = mutableListOf<VolumetricCloud>().apply {
        val random = kotlin.random.Random(1337)
        for (i in 0..75) {
            val stratum = random.nextInt(3)
            val altitude = when (stratum) {
                0 -> random.nextFloat() * 400f + 650f
                1 -> random.nextFloat() * 700f + 1600f
                else -> random.nextFloat() * 1200f + 3000f
            }
            val x = (random.nextFloat() - 0.5f) * 18000f
            val z = (random.nextFloat() - 0.5f) * 18000f
            val scale = random.nextFloat() * 1.8f + 0.6f
            add(VolumetricCloud(x, altitude, z, stratum, scale))
        }
    }

    // Projected 2D Point helper
    private data class Point2D(val x: Float, val y: Float, val zEye: Float)

    fun getIlsData(
        geoController: com.example.map.GeoFlightController,
        physics: AerodynamicsEngine
    ): IlsApproachData {
        val nearestAirport = com.example.map.GlobalAirportDatabase.airports.minByOrNull { apt ->
            val dLat = apt.latitude - geoController.latitude
            val dLng = apt.longitude - geoController.longitude
            dLat * dLat + dLng * dLng
        }
        val aptLat = nearestAirport?.latitude ?: geoController.currentLocation.latitude
        val aptLng = nearestAirport?.longitude ?: geoController.currentLocation.longitude
        val rwyHeading = nearestAirport?.runwayHeadingDeg ?: 120f
        val aptName = nearestAirport?.name ?: geoController.currentLocation.name

        return airportVisualsRenderer.calculateIlsData(
            airportLat = aptLat,
            airportLng = aptLng,
            currentLat = geoController.latitude,
            currentLng = geoController.longitude,
            planePos = physics.position,
            runwayHeadingDeg = rwyHeading,
            airportName = aptName
        )
    }

    fun drawWorld(
        drawScope: DrawScope,
        physics: AerodynamicsEngine,
        camera: Camera3D,
        world: World3D,
        geoController: com.example.map.GeoFlightController,
        isMapBackground: Boolean = false,
        isLowLightMode: Boolean = false,
        isIlsActive: Boolean = true,
        remotePlayers: List<com.example.data.MultiplayerPlayerData> = emptyList(),
        currentUserId: String = ""
    ) {
        val width = drawScope.size.width
        val height = drawScope.size.height
        val aspect = width / height

        val effectiveFov = camera.fovYDeg
        val viewMatrix = camera.getViewMatrix()
        val projMatrix = Matrix4.perspective(effectiveFov, aspect, nearPlane, farPlane)
        val viewProjMatrix = projMatrix.multiply(viewMatrix)

        if (!isMapBackground) {
            // 1. Draw Horizon Sky/Ground Background
            drawHorizonBackground(drawScope, physics, camera, width, height)

            // 2. Draw 3D Ground Grid Plane with Speed Crosses
            draw3DGridPlane(drawScope, physics, viewProjMatrix, width, height)

            // 3. Draw Mountains
            drawMountains(drawScope, viewProjMatrix, width, height)
        }

        // 4. Draw 3D Aircraft Carrier
        drawCarrier(drawScope, physics, viewProjMatrix, width, height)

        // 5. Draw Atmospheric Clouds
        drawClouds(drawScope, physics, viewProjMatrix, width, height)

        // 5.b Draw Ambient Birds
        ambientBirdSystem.update(0.016f, physics.position)
        ambientBirdSystem.draw(drawScope, viewProjMatrix, width, height, physics.position)

        // Find nearest airport in range or current location
        val nearestAirport = com.example.map.GlobalAirportDatabase.airports.minByOrNull { apt ->
            val dLat = apt.latitude - geoController.latitude
            val dLng = apt.longitude - geoController.longitude
            dLat * dLat + dLng * dLng
        }
        val aptLat = nearestAirport?.latitude ?: geoController.currentLocation.latitude
        val aptLng = nearestAirport?.longitude ?: geoController.currentLocation.longitude
        val rwyHeading = nearestAirport?.runwayHeadingDeg ?: 120f

        // 5.c Draw Airport Visual Details (Runways, Lights, Terminal, Tower, ILS Glide Slope)
        airportVisualsRenderer.drawAirportDetails(
            drawScope = drawScope,
            viewProj = viewProjMatrix,
            w = width,
            h = height,
            airportLat = aptLat,
            airportLng = aptLng,
            currentLat = geoController.latitude,
            currentLng = geoController.longitude,
            planePos = physics.position,
            runwayHeadingDeg = rwyHeading,
            isLowLightMode = isLowLightMode,
            isIlsActive = isIlsActive
        )

        // 6. Draw Waypoint Hoops
        drawRingWaypoints(drawScope, world, viewProjMatrix, width, height)

        // 6.b Draw Remote Online Multiplayer Aircraft in 3D
        if (remotePlayers.isNotEmpty()) {
            drawRemotePlayers(
                drawScope = drawScope,
                localPhysics = physics,
                geoController = geoController,
                remotePlayers = remotePlayers,
                currentUserId = currentUserId,
                viewProjMatrix = viewProjMatrix,
                w = width,
                h = height
            )
        }

        // 7. Draw 3D Aircraft Model (in Chase, Top-Down, Orbit, or during transition)
        if (camera.mode != CameraMode.COCKPIT_CAM || camera.isTransitioning) {
            drawJetAircraft(drawScope, physics, viewProjMatrix, width, height)
        }

        // 7.b Draw 3D Aerodynamic Force Vectors (Lift, Drag, Thrust, Gravity, Velocity) in Debug Mode
        if (physics.showForceVectors) {
            drawForceVectors3D(drawScope, physics, viewProjMatrix, width, height)
        }

        // 8. Draw Cockpit Canopy Framework (in Cockpit View)
        if (camera.mode == CameraMode.COCKPIT_CAM) {
            drawCockpitCanopyOverlay(drawScope, width, height, camera.transitionProgress)
        }

        // 9. Draw Tactical Range Grid (in Top-Down View)
        if (camera.mode == CameraMode.TOP_DOWN_CAM) {
            drawTopDownTacticalOverlay(drawScope, physics, viewProjMatrix, width, height)
        }
    }

    private fun project3D(v: Vector3D, viewProj: Matrix4, width: Float, height: Float): Point2D? {
        val clip = viewProj.transformVector(v)
        // Check near and far plane clip
        if (clip.z < -1.0f || clip.z > 1.0f) return null

        val screenX = (clip.x + 1.0f) * 0.5f * width
        val screenY = (1.0f - clip.y) * 0.5f * height
        return Point2D(screenX, screenY, clip.z)
    }

    private fun drawHorizonBackground(
        drawScope: DrawScope,
        physics: AerodynamicsEngine,
        camera: Camera3D,
        w: Float,
        h: Float
    ) {
        // Draw sky rect
        drawScope.drawRect(color = Color(0xFF87CEEB)) // Sky Blue

        // Compute horizon line in screen coordinates based on camera orientation
        val camForward = (camera.target - camera.eye).normalized()
        val camUp = camera.up.normalized()
        val camRight = camForward.cross(camUp).normalized()

        val pitchAngle = asin(camForward.y.coerceIn(-0.999f, 0.999f))
        val rollAngle = atan2(camRight.y, camUp.y)

        val fovYRad = Math.toRadians(camera.fovYDeg.toDouble()).toFloat()
        val tanHalfFov = tan(fovYRad * 0.5f)
        val centerY = h * 0.5f + (tan(pitchAngle) / max(0.01f, tanHalfFov)) * (h * 0.5f)

        val sinR = sin(rollAngle)
        val cosR = cos(rollAngle)
        val halfDiag = w + h

        val leftX = -halfDiag
        val rightX = w + halfDiag
        val leftY = centerY + (leftX - w * 0.5f) * (-sinR / max(0.001f, cosR))
        val rightY = centerY + (rightX - w * 0.5f) * (-sinR / max(0.001f, cosR))

        val groundPath = Path().apply {
            moveTo(leftX, leftY)
            lineTo(rightX, rightY)
            lineTo(rightX, h + halfDiag)
            lineTo(leftX, h + halfDiag)
            close()
        }

        // Draw ground terrain
        drawScope.drawPath(groundPath, color = Color(0xFF1E1F22))

        // Draw glowing horizon line
        drawScope.drawLine(
            color = Color(0xFF818CF8).copy(alpha = 0.7f),
            start = Offset(leftX, leftY),
            end = Offset(rightX, rightY),
            strokeWidth = 2.5f
        )
    }

    private fun draw3DGridPlane(
        drawScope: DrawScope,
        physics: AerodynamicsEngine,
        viewProj: Matrix4,
        w: Float,
        h: Float
    ) {
        val px = physics.position.x
        val pz = physics.position.z

        val gridRadius = (2500f + physics.position.y * 4f).coerceAtMost(100000f)
        val minorStep = kotlin.math.max(25f, gridRadius / 50f)
        val majorStep = minorStep * 4f

        val startX = (px - gridRadius) - ((px - gridRadius) % minorStep)
        val endX = px + gridRadius

        val startZ = (pz - gridRadius) - ((pz - gridRadius) % minorStep)
        val endZ = pz + gridRadius

        val minorColor = Color(0x18D0BCFF)
        val majorColor = Color(0x55D0BCFF)
        val crossColor = Color(0x99D0BCFF)

        // Z-parallel grid lines
        var x = startX
        while (x <= endX) {
            val isMajor = (abs(x % majorStep) < 1f || abs(x % majorStep) > majorStep - 1f)
            val p1 = project3D(Vector3D(x, 0f, startZ), viewProj, w, h)
            val p2 = project3D(Vector3D(x, 0f, endZ), viewProj, w, h)

            if (p1 != null && p2 != null) {
                drawScope.drawLine(
                    color = if (isMajor) majorColor else minorColor,
                    start = Offset(p1.x, p1.y),
                    end = Offset(p2.x, p2.y),
                    strokeWidth = if (isMajor) 1.5f else 0.8f
                )
            }
            x += minorStep
        }

        // X-parallel grid lines
        var z = startZ
        while (z <= endZ) {
            val isMajor = (abs(z % majorStep) < 1f || abs(z % majorStep) > majorStep - 1f)
            val p1 = project3D(Vector3D(startX, 0f, z), viewProj, w, h)
            val p2 = project3D(Vector3D(endX, 0f, z), viewProj, w, h)

            if (p1 != null && p2 != null) {
                drawScope.drawLine(
                    color = if (isMajor) majorColor else minorColor,
                    start = Offset(p1.x, p1.y),
                    end = Offset(p2.x, p2.y),
                    strokeWidth = if (isMajor) 1.5f else 0.8f
                )
            }
            z += minorStep
        }

        // High-contrast motion crosses '+' at 100m grid intersections within 1200m of aircraft
        val crossRadius = 1200f
        val startCrossX = (px - crossRadius) - ((px - crossRadius) % 100f)
        val endCrossX = px + crossRadius
        val startCrossZ = (pz - crossRadius) - ((pz - crossRadius) % 100f)
        val endCrossZ = pz + crossRadius

        var cx = startCrossX
        while (cx <= endCrossX) {
            var cz = startCrossZ
            while (cz <= endCrossZ) {
                val centerPt = project3D(Vector3D(cx, 0.1f, cz), viewProj, w, h)
                if (centerPt != null) {
                    val crossArm = 4f
                    drawScope.drawLine(
                        color = crossColor,
                        start = Offset(centerPt.x - crossArm, centerPt.y),
                        end = Offset(centerPt.x + crossArm, centerPt.y),
                        strokeWidth = 2f
                    )
                    drawScope.drawLine(
                        color = crossColor,
                        start = Offset(centerPt.x, centerPt.y - crossArm),
                        end = Offset(centerPt.x, centerPt.y + crossArm),
                        strokeWidth = 2f
                    )
                }
                cz += 100f
            }
            cx += 100f
        }
    }

    private fun drawCarrier(
        drawScope: DrawScope,
        physics: AerodynamicsEngine,
        viewProj: Matrix4,
        w: Float,
        h: Float
    ) {
        val hw = World3D.CARRIER_WIDTH / 2f
        val sz = World3D.CARRIER_START_Z
        val ez = World3D.CARRIER_END_Z
        val alt = World3D.CARRIER_ALTITUDE

        // 1. Carrier Flight Deck Polygon
        val corners = listOf(
            Vector3D(-hw, alt, sz),
            Vector3D(hw, alt, sz),
            Vector3D(hw, alt, ez),
            Vector3D(-hw, alt, ez)
        ).mapNotNull { project3D(it, viewProj, w, h) }

        if (corners.size == 4) {
            val polyPath = Path().apply {
                moveTo(corners[0].x, corners[0].y)
                lineTo(corners[1].x, corners[1].y)
                lineTo(corners[2].x, corners[2].y)
                lineTo(corners[3].x, corners[3].y)
                close()
            }
            drawScope.drawPath(polyPath, color = Color(0xFF333538)) // Dark grey deck
            drawScope.drawPath(polyPath, color = Color(0xFFE2E8F0), style = Stroke(width = 2f))
        }

        // 2. Carrier Hull Sides (simplified)
        val hullCorners = listOf(
            Vector3D(-hw, 0f, sz),
            Vector3D(-hw, alt, sz),
            Vector3D(-hw, alt, ez),
            Vector3D(-hw, 0f, ez)
        ).mapNotNull { project3D(it, viewProj, w, h) }
        
        if (hullCorners.size == 4) {
            val polyPath = Path().apply {
                moveTo(hullCorners[0].x, hullCorners[0].y)
                lineTo(hullCorners[1].x, hullCorners[1].y)
                lineTo(hullCorners[2].x, hullCorners[2].y)
                lineTo(hullCorners[3].x, hullCorners[3].y)
                close()
            }
            drawScope.drawPath(polyPath, color = Color(0xFF1E2124)) // Darker hull
        }

        val hullCornersRight = listOf(
            Vector3D(hw, 0f, sz),
            Vector3D(hw, alt, sz),
            Vector3D(hw, alt, ez),
            Vector3D(hw, 0f, ez)
        ).mapNotNull { project3D(it, viewProj, w, h) }
        
        if (hullCornersRight.size == 4) {
            val polyPath = Path().apply {
                moveTo(hullCornersRight[0].x, hullCornersRight[0].y)
                lineTo(hullCornersRight[1].x, hullCornersRight[1].y)
                lineTo(hullCornersRight[2].x, hullCornersRight[2].y)
                lineTo(hullCornersRight[3].x, hullCornersRight[3].y)
                close()
            }
            drawScope.drawPath(polyPath, color = Color(0xFF1E2124)) // Darker hull
        }

        val hullCornersBack = listOf(
            Vector3D(-hw, 0f, sz),
            Vector3D(-hw, alt, sz),
            Vector3D(hw, alt, sz),
            Vector3D(hw, 0f, sz)
        ).mapNotNull { project3D(it, viewProj, w, h) }

        if (hullCornersBack.size == 4) {
            val polyPath = Path().apply {
                moveTo(hullCornersBack[0].x, hullCornersBack[0].y)
                lineTo(hullCornersBack[1].x, hullCornersBack[1].y)
                lineTo(hullCornersBack[2].x, hullCornersBack[2].y)
                lineTo(hullCornersBack[3].x, hullCornersBack[3].y)
                close()
            }
            drawScope.drawPath(polyPath, color = Color(0xFF1E2124))
        }

        // 3. Centerline Dashes (every 20m)
        var z = sz + 10f
        while (z < ez - 10f) {
            val c1 = project3D(Vector3D(0f, alt + 0.1f, z), viewProj, w, h)
            val c2 = project3D(Vector3D(0f, alt + 0.1f, z + 10f), viewProj, w, h)
            if (c1 != null && c2 != null) {
                drawScope.drawLine(
                    color = Color(0xFFFFFFFF),
                    start = Offset(c1.x, c1.y),
                    end = Offset(c2.x, c2.y),
                    strokeWidth = 2f
                )
            }
            z += 20f
        }

        // 4. Catapult tracks (front deck)
        val catStartZ = ez - 80f
        val catEndZ = ez - 10f
        val catLeftStart = project3D(Vector3D(-15f, alt + 0.1f, catStartZ), viewProj, w, h)
        val catLeftEnd = project3D(Vector3D(-15f, alt + 0.1f, catEndZ), viewProj, w, h)
        if (catLeftStart != null && catLeftEnd != null) {
            drawScope.drawLine(Color(0xFF64748B), Offset(catLeftStart.x, catLeftStart.y), Offset(catLeftEnd.x, catLeftEnd.y), 4f)
        }
        val catRightStart = project3D(Vector3D(15f, alt + 0.1f, catStartZ), viewProj, w, h)
        val catRightEnd = project3D(Vector3D(15f, alt + 0.1f, catEndZ), viewProj, w, h)
        if (catRightStart != null && catRightEnd != null) {
            drawScope.drawLine(Color(0xFF64748B), Offset(catRightStart.x, catRightStart.y), Offset(catRightEnd.x, catRightEnd.y), 4f)
        }

        // 5. Island Superstructure
        val islandX = hw - 10f
        val islandZ = 20f
        val islandW = 15f
        val islandL = 40f
        val islandH = 25f
        val towerTop = project3D(Vector3D(islandX, alt + islandH, islandZ), viewProj, w, h)
        val towerBase = project3D(Vector3D(islandX, alt, islandZ), viewProj, w, h)
        if (towerBase != null && towerTop != null) {
            drawScope.drawLine(color = Color(0xFF64748B), start = Offset(towerBase.x, towerBase.y), end = Offset(towerTop.x, towerTop.y), strokeWidth = 20f)
            drawScope.drawCircle(color = Color(0xFF38BDF8), radius = 6f, center = Offset(towerTop.x, towerTop.y))
            drawScope.drawCircle(color = Color(0xFFEF4444), radius = 3f, center = Offset(towerTop.x, towerTop.y - 6f))
        }

        // 6. Arresting Wires (rear deck)
        for (i in 0..3) {
            val wireZ = sz + 30f + (i * 10f)
            val w1 = project3D(Vector3D(-20f, alt + 0.2f, wireZ), viewProj, w, h)
            val w2 = project3D(Vector3D(20f, alt + 0.2f, wireZ), viewProj, w, h)
            if (w1 != null && w2 != null) {
                drawScope.drawLine(Color(0xFF94A3B8), Offset(w1.x, w1.y), Offset(w2.x, w2.y), 1.5f)
            }
        }
    }

    private fun drawClouds(
        drawScope: DrawScope,
        physics: AerodynamicsEngine,
        viewProj: Matrix4,
        w: Float,
        h: Float
    ) {
        val planeX = physics.position.x
        val planeZ = physics.position.z
        val worldSpread = 18000f
        val halfSpread = worldSpread * 0.5f

        data class RenderableCloud(
            val pCenter: Point2D,
            val cloud: VolumetricCloud,
            val radius: Float
        )

        val renderableClouds = ArrayList<RenderableCloud>()

        volumetricClouds.forEach { cloud ->
            var relX = (cloud.initialX + planeX * 0.15f) % worldSpread
            if (relX > halfSpread) relX -= worldSpread
            if (relX < -halfSpread) relX += worldSpread

            var relZ = (cloud.initialZ + planeZ * 0.15f) % worldSpread
            if (relZ > halfSpread) relZ -= worldSpread
            if (relZ < -halfSpread) relZ += worldSpread

            val worldPos = Vector3D(planeX + relX, cloud.altitude, planeZ + relZ)
            val pCenter = project3D(worldPos, viewProj, w, h)

            if (pCenter != null && pCenter.zEye > 0f && pCenter.zEye < 120000f) {
                val radius = (240f * cloud.scale / (pCenter.zEye + 1.0f)).coerceIn(15f, 180f)
                renderableClouds.add(RenderableCloud(pCenter, cloud, radius))
            }
        }

        // Depth sorting (Painter's Algorithm: furthest clouds rendered first)
        renderableClouds.sortByDescending { it.pCenter.zEye }

        renderableClouds.forEach { rc ->
            val p = rc.pCenter
            val r = rc.radius
            val cx = p.x
            val cy = p.y

            val (shadowColor, bodyColor, highlightColor) = when (rc.cloud.stratum) {
                0 -> Triple(Color(0x33334155), Color(0x55F1F5F9), Color(0x99FFFFFF))
                1 -> Triple(Color(0x28475569), Color(0x48E2E8F0), Color(0x88FFFFFF))
                else -> Triple(Color(0x1A64748B), Color(0x38F8FAFC), Color(0x77FFFFFF))
            }

            // 1. Base Shadow Layer (Ambient Occlusion underneath)
            val shadowYOffset = r * 0.22f
            drawScope.drawCircle(color = shadowColor, radius = r * 0.95f, center = Offset(cx, cy + shadowYOffset))
            drawScope.drawCircle(color = shadowColor, radius = r * 0.7f, center = Offset(cx - r * 0.35f, cy + shadowYOffset * 1.2f))
            drawScope.drawCircle(color = shadowColor, radius = r * 0.65f, center = Offset(cx + r * 0.4f, cy + shadowYOffset * 1.1f))

            // 2. Volumetric Body Puffs (Layered organic silhouettes)
            drawScope.drawCircle(color = bodyColor, radius = r, center = Offset(cx, cy))
            drawScope.drawCircle(color = bodyColor, radius = r * 0.78f, center = Offset(cx - r * 0.42f, cy + r * 0.05f))
            drawScope.drawCircle(color = bodyColor, radius = r * 0.75f, center = Offset(cx + r * 0.46f, cy + r * 0.08f))
            drawScope.drawCircle(color = bodyColor, radius = r * 0.82f, center = Offset(cx + r * 0.05f, cy + r * 0.22f))
            drawScope.drawCircle(color = bodyColor, radius = r * 0.68f, center = Offset(cx - r * 0.12f, cy - r * 0.32f))

            // 3. Sunlit Highlights (Top-left illumination)
            val hiX = cx - r * 0.22f
            val hiY = cy - r * 0.35f
            drawScope.drawCircle(color = highlightColor, radius = r * 0.52f, center = Offset(hiX, hiY))
            drawScope.drawCircle(color = highlightColor, radius = r * 0.38f, center = Offset(hiX + r * 0.35f, hiY + r * 0.1f))

            // 4. Subtle Soft Rim Outline for Depth Definition
            drawScope.drawCircle(
                color = Color(0x44FFFFFF),
                radius = r * 0.96f,
                center = Offset(cx, cy),
                style = Stroke(width = 1.2f)
            )
        }
    }

    private fun drawMountains(
        drawScope: DrawScope,
        viewProj: Matrix4,
        w: Float,
        h: Float
    ) {
        World3D.MOUNTAINS.forEach { m ->
            val baseR = 700f
            val top = project3D(m, viewProj, w, h)
            val b1 = project3D(m + Vector3D(-baseR, -m.y, -baseR), viewProj, w, h)
            val b2 = project3D(m + Vector3D(baseR, -m.y, -baseR), viewProj, w, h)
            val b3 = project3D(m + Vector3D(baseR, -m.y, baseR), viewProj, w, h)
            val b4 = project3D(m + Vector3D(-baseR, -m.y, baseR), viewProj, w, h)

            if (top != null) {
                val wireColor = Color(0x6664748B)
                listOf(b1, b2, b3, b4).forEach { b ->
                    if (b != null) {
                        drawScope.drawLine(
                            color = wireColor,
                            start = Offset(top.x, top.y),
                            end = Offset(b.x, b.y),
                            strokeWidth = 2f
                        )
                    }
                }
            }
        }
    }

    private fun drawRingWaypoints(
        drawScope: DrawScope,
        world: World3D,
        viewProj: Matrix4,
        w: Float,
        h: Float
    ) {
        world.ringWaypoints.forEach { ring ->
            val color = when {
                ring.isPassed -> Color(0xFF22C55E) // Green for cleared
                ring.isActive -> Color(0xFF38BDF8) // Bright Cyan for active target
                else -> Color(0x6664748B)
            }

            // Draw Octagon Ring in 3D
            val segments = 8
            val points = mutableListOf<Point2D>()
            for (i in 0 until segments) {
                val angle = (2 * Math.PI * i / segments).toFloat()
                val rx = ring.position.x + ring.radius * cos(angle)
                val ry = ring.position.y + ring.radius * sin(angle)
                val rz = ring.position.z

                val p2d = project3D(Vector3D(rx, ry, rz), viewProj, w, h)
                if (p2d != null) points.add(p2d)
            }

            if (points.size >= 3) {
                val ringPath = Path()
                ringPath.moveTo(points[0].x, points[0].y)
                for (i in 1 until points.size) {
                    ringPath.lineTo(points[i].x, points[i].y)
                }
                ringPath.close()

                drawScope.drawPath(
                    path = ringPath,
                    color = color,
                    style = Stroke(width = if (ring.isActive) 5f else 2.5f)
                )
            }
        }
    }

    private fun drawJetAircraft(
        drawScope: DrawScope,
        physics: AerodynamicsEngine,
        viewProj: Matrix4,
        w: Float,
        h: Float
    ) {
        val planePos = physics.position
        val rotMat = Matrix4.rotationYawPitchRoll(physics.yawRad, physics.pitchRad, physics.rollRad)

        // Transform and Project local jet mesh vertices into 3D world space
        val worldVerts = JetMesh.vertices.map { localV ->
            val rotated = rotMat.transformVector(localV)
            planePos + rotated
        }

        val projectedPoints = worldVerts.map { vWorld ->
            project3D(vWorld, viewProj, w, h)
        }

        // 1. Render 3D Polygon Faces (Shaded & Depth-Sorted Back-to-Front)
        val lightDir = Vector3D(0.4f, 0.8f, 0.4f).normalized()

        val sortedFaces = JetMesh.faces.mapNotNull { face ->
            val p1 = projectedPoints.getOrNull(face.v1)
            val p2 = projectedPoints.getOrNull(face.v2)
            val p3 = projectedPoints.getOrNull(face.v3)

            if (p1 != null && p2 != null && p3 != null) {
                val avgZ = (p1.zEye + p2.zEye + p3.zEye) / 3f
                Triple(face, listOf(p1, p2, p3), avgZ)
            } else null
        }.sortedBy { it.third } // Depth sorting for Compose Canvas

        sortedFaces.forEach { (face, points, _) ->
            // Compute face normal in local space
            val v1 = JetMesh.vertices[face.v1]
            val v2 = JetMesh.vertices[face.v2]
            val v3 = JetMesh.vertices[face.v3]
            val edge1 = v2 - v1
            val edge2 = v3 - v1
            val localNormal = edge1.cross(edge2).normalized()

            val worldNormal = rotMat.transformVector(localNormal)
            val diffLight = (worldNormal.dot(lightDir) * 0.4f + 0.6f).coerceIn(0.2f, 1.0f)

            val facePath = Path().apply {
                moveTo(points[0].x, points[0].y)
                lineTo(points[1].x, points[1].y)
                lineTo(points[2].x, points[2].y)
                close()
            }

            val faceColor = when (face.material) {
                JetMesh.MeshMaterial.FUSELAGE_DARK -> Color(
                    (0x33 * diffLight).toInt(),
                    (0x41 * diffLight).toInt(),
                    (0x55 * diffLight).toInt()
                )
                JetMesh.MeshMaterial.FUSELAGE_LIGHT -> Color(
                    (0x47 * diffLight).toInt(),
                    (0x55 * diffLight).toInt(),
                    (0x69 * diffLight).toInt()
                )
                JetMesh.MeshMaterial.CANOPY_GLASS -> Color(
                    0x1E,
                    0x88,
                    0xE5,
                    0xDD
                )
                JetMesh.MeshMaterial.WING_SURFACE -> Color(
                    (0x3B * diffLight).toInt(),
                    (0x48 * diffLight).toInt(),
                    (0x5C * diffLight).toInt()
                )
                JetMesh.MeshMaterial.TAIL_FIN -> Color(
                    (0x2E * diffLight).toInt(),
                    (0x38 * diffLight).toInt(),
                    (0x48 * diffLight).toInt()
                )
            }

            drawScope.drawPath(path = facePath, color = faceColor)
        }

        // 2. High-Tech Tactical Edge Highlights
        val edgeColor = Color(0xFF94A3B8)
        val noseColor = Color(0xFFF8FAFC)

        JetMesh.edges.forEach { (idx1, idx2) ->
            val p1 = projectedPoints.getOrNull(idx1)
            val p2 = projectedPoints.getOrNull(idx2)

            if (p1 != null && p2 != null) {
                drawScope.drawLine(
                    color = if (idx1 == 0 || idx2 == 0) noseColor else edgeColor,
                    start = Offset(p1.x, p1.y),
                    end = Offset(p2.x, p2.y),
                    strokeWidth = 1.8f
                )
            }
        }

        // 3. Dual Engine Afterburner Thrust Flames
        if (physics.throttle > 0.05f) {
            val nozzles = listOf(
                JetMesh.vertices[24], // Left nozzle
                JetMesh.vertices[25]  // Right nozzle
            )

            val flicker = 0.9f + ((System.currentTimeMillis() % 100) / 500f)
            val flameLen = (3.5f + (physics.throttle * 7.5f) + (if (physics.isAfterburner) 5.5f else 0f)) * flicker

            nozzles.forEach { nozzleLocal ->
                val nozzleWorld = planePos + rotMat.transformVector(nozzleLocal)
                val flameEndLocal = nozzleLocal + Vector3D(0f, 0f, -flameLen)
                val flameEndWorld = planePos + rotMat.transformVector(flameEndLocal)

                val pNozzle = project3D(nozzleWorld, viewProj, w, h)
                val pFlame = project3D(flameEndWorld, viewProj, w, h)

                if (pNozzle != null && pFlame != null) {
                    // Outer Flame Glow
                    drawScope.drawLine(
                        color = if (physics.isAfterburner) Color(0xCCEF4444) else Color(0xCCF59E0B),
                        start = Offset(pNozzle.x, pNozzle.y),
                        end = Offset(pFlame.x, pFlame.y),
                        strokeWidth = if (physics.isAfterburner) 12f else 8f
                    )
                    // Inner Core Flame
                    drawScope.drawLine(
                        color = Color(0xFFFFFFFF),
                        start = Offset(pNozzle.x, pNozzle.y),
                        end = Offset(pFlame.x, pFlame.y),
                        strokeWidth = 3.5f
                    )
                }
            }
        }

        // 4. High-G Wingtip Vapor Trails (Condensation during hard pitch/bank)
        if (abs(physics.gForce) > 2.8f) {
            val tipLeft = JetMesh.vertices[11]
            val tipRight = JetMesh.vertices[15]
            val trailLen = (abs(physics.gForce) - 2.8f) * 6f

            listOf(tipLeft, tipRight).forEach { tipLocal ->
                val tipWorld = planePos + rotMat.transformVector(tipLocal)
                val trailWorld = tipWorld + (physics.forwardVector * -trailLen)
                val pTip = project3D(tipWorld, viewProj, w, h)
                val pTrail = project3D(trailWorld, viewProj, w, h)

                if (pTip != null && pTrail != null) {
                    drawScope.drawLine(
                        color = Color(0xAAFFFFFF),
                        start = Offset(pTip.x, pTip.y),
                        end = Offset(pTrail.x, pTrail.y),
                        strokeWidth = 3f
                    )
                }
            }
        }

        // 5. 3D Landing Gear (Nose Gear & Main Gear)
        if (physics.isLandingGearDown) {
            val gearPositions = listOf(
                Pair(Vector3D(0f, 0f, 2.5f), Vector3D(0f, -0.9f, 2.5f)),       // Nose Gear
                Pair(Vector3D(-1.2f, -0.1f, -0.5f), Vector3D(-1.2f, -0.9f, -0.5f)), // Left Main Gear
                Pair(Vector3D(1.2f, -0.1f, -0.5f), Vector3D(1.2f, -0.9f, -0.5f))    // Right Main Gear
            )

            gearPositions.forEach { (topLocal, bottomLocal) ->
                val topWorld = planePos + rotMat.transformVector(topLocal)
                val botWorld = planePos + rotMat.transformVector(bottomLocal)

                val pTop = project3D(topWorld, viewProj, w, h)
                val pBot = project3D(botWorld, viewProj, w, h)

                if (pTop != null && pBot != null) {
                    // Gear Strut (Titanium)
                    drawScope.drawLine(
                        color = Color(0xFFCBD5E1),
                        start = Offset(pTop.x, pTop.y),
                        end = Offset(pBot.x, pBot.y),
                        strokeWidth = 3.5f
                    )
                    // Gear Wheel / Tire
                    drawScope.drawCircle(
                        color = Color(0xFF0F172A),
                        radius = 4.5f,
                        center = Offset(pBot.x, pBot.y)
                    )
                }
            }

            // Touchdown tire smoke effect during touchdown rollout
            if (physics.currentPhase == FlightPhase.TOUCHDOWN_ROLLOUT && physics.groundSpeedKnots > 30f) {
                val smokePuff1 = project3D(planePos + rotMat.transformVector(Vector3D(-1.2f, -0.9f, -0.8f)), viewProj, w, h)
                val smokePuff2 = project3D(planePos + rotMat.transformVector(Vector3D(1.2f, -0.9f, -0.8f)), viewProj, w, h)
                listOf(smokePuff1, smokePuff2).forEach { pt ->
                    if (pt != null) {
                        drawScope.drawCircle(
                            color = Color(0x66CBD5E1),
                            radius = 12f,
                            center = Offset(pt.x, pt.y)
                        )
                    }
                }
            }
        }

        // 6. Ground Shadow if altitude < 300m
        if (physics.position.y in 0.02f..300f) {
            val shadowCenter = Vector3D(planePos.x, 0.1f, planePos.z)
            val pShadow = project3D(shadowCenter, viewProj, w, h)
            if (pShadow != null) {
                val alpha = (1.0f - (physics.position.y / 300f)).coerceIn(0.1f, 0.75f)
                val shadowRadius = (16f * alpha).coerceAtLeast(3f)
                drawScope.drawCircle(
                    color = Color.Black.copy(alpha = alpha),
                    radius = shadowRadius,
                    center = Offset(pShadow.x, pShadow.y)
                )
            }
        }
    }

    private fun drawCockpitCanopyOverlay(
        drawScope: DrawScope,
        w: Float,
        h: Float,
        progress: Float
    ) {
        val alpha = progress.coerceIn(0f, 1f)
        val frameColor = Color(0xFF1E293B).copy(alpha = 0.92f * alpha)
        val glassGlow = Color(0x1538BDF8).copy(alpha = 0.12f * alpha)
        val glareshieldColor = Color(0xFF0F172A).copy(alpha = 0.95f * alpha)

        // Lower Cockpit Instrument Glareshield
        val dashPath = Path().apply {
            moveTo(0f, h)
            lineTo(0f, h * 0.82f)
            lineTo(w * 0.22f, h * 0.80f)
            lineTo(w * 0.5f, h * 0.78f)
            lineTo(w * 0.78f, h * 0.80f)
            lineTo(w, h * 0.82f)
            lineTo(w, h)
            close()
        }
        drawScope.drawPath(dashPath, color = glareshieldColor)

        // Left Canopy Bow Frame Pillar
        val leftPillar = Path().apply {
            moveTo(0f, 0f)
            lineTo(w * 0.12f, 0f)
            lineTo(w * 0.22f, h * 0.80f)
            lineTo(0f, h * 0.82f)
            close()
        }
        drawScope.drawPath(leftPillar, color = frameColor)

        // Right Canopy Bow Frame Pillar
        val rightPillar = Path().apply {
            moveTo(w, 0f)
            lineTo(w * 0.88f, 0f)
            lineTo(w * 0.78f, h * 0.80f)
            lineTo(w, h * 0.82f)
            close()
        }
        drawScope.drawPath(rightPillar, color = frameColor)

        // Top Canopy Arch
        drawScope.drawRect(
            color = frameColor,
            topLeft = Offset(0f, 0f),
            size = androidx.compose.ui.geometry.Size(w, h * 0.04f)
        )

        // HUD Glass Frame Combiner Glass Outline
        val hudGlassLeft = w * 0.32f
        val hudGlassRight = w * 0.68f
        val hudGlassTop = h * 0.18f
        val hudGlassBot = h * 0.78f

        drawScope.drawRect(
            color = glassGlow,
            topLeft = Offset(hudGlassLeft, hudGlassTop),
            size = androidx.compose.ui.geometry.Size(hudGlassRight - hudGlassLeft, hudGlassBot - hudGlassTop)
        )

        drawScope.drawLine(
            color = Color(0x5538BDF8),
            start = Offset(hudGlassLeft, hudGlassTop),
            end = Offset(hudGlassRight, hudGlassTop),
            strokeWidth = 2f
        )
        drawScope.drawLine(
            color = Color(0x3338BDF8),
            start = Offset(hudGlassLeft, hudGlassTop),
            end = Offset(hudGlassLeft, hudGlassBot),
            strokeWidth = 2f
        )
        drawScope.drawLine(
            color = Color(0x3338BDF8),
            start = Offset(hudGlassRight, hudGlassTop),
            end = Offset(hudGlassRight, hudGlassBot),
            strokeWidth = 2f
        )
    }

    private fun drawTopDownTacticalOverlay(
        drawScope: DrawScope,
        physics: AerodynamicsEngine,
        viewProj: Matrix4,
        w: Float,
        h: Float
    ) {
        val planeScreen = project3D(physics.position, viewProj, w, h) ?: return
        val cx = planeScreen.x
        val cy = planeScreen.y

        val rangeColor = Color(0x33D0BCFF)

        // Tactical Range Rings
        drawScope.drawCircle(color = rangeColor, radius = 60f, center = Offset(cx, cy), style = Stroke(width = 1.5f))
        drawScope.drawCircle(color = rangeColor, radius = 130f, center = Offset(cx, cy), style = Stroke(width = 1.5f))
        drawScope.drawCircle(color = rangeColor, radius = 210f, center = Offset(cx, cy), style = Stroke(width = 1.5f))

        // Tactical Heading Vector Line
        val forwardHead = physics.position + (physics.forwardVector * 40f)
        val pHead = project3D(forwardHead, viewProj, w, h)
        if (pHead != null) {
            drawScope.drawLine(
                color = Color(0xFF4ADE80),
                start = Offset(cx, cy),
                end = Offset(pHead.x, pHead.y),
                strokeWidth = 2f
            )
        }
    }

    fun drawJetInMapView(
        drawScope: DrawScope,
        physics: AerodynamicsEngine,
        camera: Camera3D
    ) {
        val width = drawScope.size.width
        val height = drawScope.size.height
        val aspect = width / height

        val viewMatrix = camera.getViewMatrix()
        val projMatrix = Matrix4.perspective(camera.fovYDeg, aspect, nearPlane, farPlane)
        val viewProjMatrix = projMatrix.multiply(viewMatrix)
        drawJetAircraft(drawScope, physics, viewProjMatrix, width, height)
        if (physics.showForceVectors) {
            drawForceVectors3D(drawScope, physics, viewProjMatrix, width, height)
        }
    }

    /**
     * Renders real-time 3D force vectors originating from the aircraft's Center of Mass:
     * - Lift (Emerald Green #22C55E)
     * - Drag (Coral Red #EF4444)
     * - Thrust (Cyan #00E5FF)
     * - Gravity / Weight (Amber #FACC15)
     * - Relative Velocity / AoA Flight Path Vector (Magenta #E879F9)
     */
    private fun drawForceVectors3D(
        drawScope: DrawScope,
        physics: AerodynamicsEngine,
        viewProj: Matrix4,
        w: Float,
        h: Float
    ) {
        val comPos = physics.position
        val pOrigin = project3D(comPos, viewProj, w, h) ?: return
        val aero = physics.lastAeroForces
        val refWeight = physics.weightN.coerceAtLeast(1000f)

        // Draw Center of Mass (CoM) marker sphere
        drawScope.drawCircle(
            color = Color.White,
            radius = 6f,
            center = Offset(pOrigin.x, pOrigin.y)
        )
        drawScope.drawCircle(
            color = Color(0xFF0F172A),
            radius = 3f,
            center = Offset(pOrigin.x, pOrigin.y)
        )

        fun draw3DArrow(
            dirWorld: Vector3D,
            lengthMeters: Float,
            color: Color,
            dashed: Boolean = false
        ) {
            if (lengthMeters < 0.4f || dirWorld.lengthSquared() < 0.0001f) return
            val unitDir = dirWorld.normalized()
            val tipWorld = comPos + (unitDir * lengthMeters)
            val pTip = project3D(tipWorld, viewProj, w, h) ?: return

            // Outer glow
            drawScope.drawLine(
                color = color.copy(alpha = 0.30f),
                start = Offset(pOrigin.x, pOrigin.y),
                end = Offset(pTip.x, pTip.y),
                strokeWidth = 9f
            )

            // Main vector shaft
            drawScope.drawLine(
                color = color,
                start = Offset(pOrigin.x, pOrigin.y),
                end = Offset(pTip.x, pTip.y),
                strokeWidth = 3.8f,
                pathEffect = if (dashed) PathEffect.dashPathEffect(floatArrayOf(10f, 6f), 0f) else null
            )

            // 2D screen-space arrowhead aligned with projected vector direction
            val dx = pTip.x - pOrigin.x
            val dy = pTip.y - pOrigin.y
            val screenLen = sqrt(dx * dx + dy * dy)
            if (screenLen > 8f) {
                val ux = dx / screenLen
                val uy = dy / screenLen
                val px = -uy
                val py = ux
                val headLen = 13f
                val headHalfWidth = 6.5f

                val arrowHead = Path().apply {
                    moveTo(pTip.x, pTip.y)
                    lineTo(pTip.x - ux * headLen + px * headHalfWidth, pTip.y - uy * headLen + py * headHalfWidth)
                    lineTo(pTip.x - ux * headLen - px * headHalfWidth, pTip.y - uy * headLen - py * headHalfWidth)
                    close()
                }
                drawScope.drawPath(arrowHead, color = color)
                drawScope.drawPath(arrowHead, color = Color.White.copy(alpha = 0.7f), style = Stroke(width = 1.2f))
            }
        }

        // 1. Gravity / Weight Vector (Downward -Y, 1G = 11m reference)
        draw3DArrow(
            dirWorld = Vector3D(0f, -1f, 0f),
            lengthMeters = 11.0f,
            color = Color(0xFFFACC15) // Amber Gold
        )

        // 2. Lift Vector (Perpendicular to relative airflow in symmetry plane)
        val liftDir = aero?.forceLift ?: (physics.upVector * physics.liftN)
        val liftRatio = (physics.liftN / refWeight).coerceIn(0f, 3.0f)
        if (liftRatio > 0.02f) {
            draw3DArrow(
                dirWorld = liftDir,
                lengthMeters = 2.0f + liftRatio * 9.0f,
                color = Color(0xFF22C55E) // Emerald Green
            )
        }

        // 3. Drag Vector (Opposing relative velocity)
        val dragDir = aero?.forceDrag ?: (physics.forwardVector * -physics.dragN)
        val dragRatio = (physics.dragN / refWeight).coerceIn(0f, 2.5f)
        if (dragRatio > 0.01f) {
            draw3DArrow(
                dirWorld = dragDir,
                lengthMeters = 2.5f + dragRatio * 14.0f,
                color = Color(0xFFEF4444) // Coral Red
            )
        }

        // 4. Thrust Vector (Along longitudinal body axis +Forward)
        val thrustRatio = (physics.thrustN / refWeight).coerceIn(0f, 2.5f)
        if (thrustRatio > 0.02f) {
            draw3DArrow(
                dirWorld = physics.forwardVector,
                lengthMeters = 2.5f + thrustRatio * 9.5f,
                color = Color(0xFF00E5FF) // Electric Cyan
            )
        }

        // 5. Relative Air Velocity Vector (Dashed Magenta showing AoA & Sideslip vs Nose)
        if (physics.airspeedMS > 3.0f) {
            val relVel = if (physics.windSystem.isWindEnabled && !physics.isOnGround) {
                physics.velocity - physics.windSystem.currentWindVelocityMS
            } else {
                physics.velocity
            }
            draw3DArrow(
                dirWorld = relVel,
                lengthMeters = 13.5f,
                color = Color(0xFFE879F9), // Magenta
                dashed = true
            )
        }
    }

    private fun drawRemotePlayers(
        drawScope: DrawScope,
        localPhysics: AerodynamicsEngine,
        geoController: com.example.map.GeoFlightController,
        remotePlayers: List<com.example.data.MultiplayerPlayerData>,
        currentUserId: String,
        viewProjMatrix: Matrix4,
        w: Float,
        h: Float
    ) {
        val currentLat = geoController.latitude
        val currentLng = geoController.longitude

        remotePlayers.forEach { player ->
            if (player.uid.isBlank() || player.uid == currentUserId) return@forEach

            val dLatMeters = (player.lat - currentLat) * 111_000.0
            val dLngMeters = (player.lon - currentLng) * 111_000.0 * cos(Math.toRadians(currentLat))

            val remoteX = (localPhysics.position.x + dLngMeters).toFloat()
            val remoteZ = (localPhysics.position.z + dLatMeters).toFloat()
            val remoteY = (player.altFeet * 0.3048).toFloat()

            val remoteWorldPos = Vector3D(remoteX, remoteY, remoteZ)

            val headingRad = Math.toRadians(player.headingDeg).toFloat()
            val pitchRad = Math.toRadians(player.pitchDeg).toFloat()
            val rollRad = Math.toRadians(player.rollDeg).toFloat()
            val rotMat = Matrix4.rotationYawPitchRoll(headingRad, pitchRad, rollRad)

            val distMeters = (remoteWorldPos - localPhysics.position).length()
            val distNm = distMeters * 0.000539957f

            val pCenter = project3D(remoteWorldPos, viewProjMatrix, w, h) ?: return@forEach

            if (pCenter.zEye > 0f && pCenter.zEye < 100_000f) {
                if (distMeters < 15_000f) {
                    val worldVerts = JetMesh.vertices.map { localV ->
                        val rotated = rotMat.transformVector(localV)
                        remoteWorldPos + rotated
                    }
                    val projPoints = worldVerts.map { v -> project3D(v, viewProjMatrix, w, h) }

                    JetMesh.edges.forEach { (i1, i2) ->
                        val p1 = projPoints.getOrNull(i1)
                        val p2 = projPoints.getOrNull(i2)
                        if (p1 != null && p2 != null) {
                            drawScope.drawLine(
                                color = Color(0xFFEF4444), // Coral Red
                                start = Offset(p1.x, p1.y),
                                end = Offset(p2.x, p2.y),
                                strokeWidth = 2f
                            )
                        }
                    }
                }

                val diamondRadius = 12f
                val cx = pCenter.x
                val cy = pCenter.y

                val diamondPath = Path().apply {
                    moveTo(cx, cy - diamondRadius)
                    lineTo(cx + diamondRadius, cy)
                    lineTo(cx, cy + diamondRadius)
                    lineTo(cx - diamondRadius, cy)
                    close()
                }

                drawScope.drawPath(
                    path = diamondPath,
                    color = Color(0xFFEF4444),
                    style = Stroke(width = 2f)
                )

                val paint = android.graphics.Paint().apply {
                    color = android.graphics.Color.parseColor("#FCA5A5")
                    textSize = 28f
                    isAntiAlias = true
                    typeface = android.graphics.Typeface.DEFAULT_BOLD
                }

                drawScope.drawContext.canvas.nativeCanvas.drawText(
                    player.callsign,
                    cx + diamondRadius + 6f,
                    cy - 6f,
                    paint
                )

                val subPaint = android.graphics.Paint().apply {
                    color = android.graphics.Color.parseColor("#38BDF8")
                    textSize = 22f
                    isAntiAlias = true
                }

                drawScope.drawContext.canvas.nativeCanvas.drawText(
                    "%.1f NM | %d FT".format(distNm, player.altFeet.toInt()),
                    cx + diamondRadius + 6f,
                    cy + 18f,
                    subPaint
                )
            }
        }
    }
}
