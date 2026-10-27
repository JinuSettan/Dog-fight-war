package com.example.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Air
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.Flight
import androidx.compose.material.icons.filled.FlightLand
import androidx.compose.material.icons.filled.FlightTakeoff
import androidx.compose.material.icons.filled.Layers
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.NightsStay
import androidx.compose.material.icons.filled.Public
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChange
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.unit.IntSize
import kotlinx.coroutines.launch
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.ui.geometry.Offset
import com.example.physics.AerodynamicsEngine
import com.example.render3d.Camera3D
import com.example.render3d.CameraMode
import kotlin.math.roundToInt


import androidx.compose.material.icons.filled.BugReport

@Composable
fun Modifier.debugHitbox(enabled: Boolean): Modifier = if (enabled) {
    this.border(2.dp, Color.Red).background(Color(0x33FF0000))
} else {
    this
}

@Composable
fun FlightControlsOverlay(
    physics: AerodynamicsEngine,
    camera: Camera3D,
    onResetFlight: () -> Unit,
    onTogglePhysicsPanel: () -> Unit,
    onToggleAircraftDialog: () -> Unit,
    onToggleLocationDialog: () -> Unit = {},
    onToggleAirportDialog: () -> Unit = {},
    onToggleMultiplayerDialog: () -> Unit = {},
    isMultiplayerActive: Boolean = false,
    onlinePlayerCount: Int = 0,
    onToggleMapType: () -> Unit = {},
    onToggleRealWorldMap: () -> Unit = {},
    onToggleMinimap: () -> Unit = {},
    showMinimap: Boolean = true,
    isRealWorldMapMode: Boolean = true,
    isLowLightMode: Boolean = false,
    onToggleLowLightMode: () -> Unit = {},
    isIlsActive: Boolean = true,
    onToggleIls: () -> Unit = {},
    currentLocationName: String = "San Francisco Bay",
    mapTypeLabel: String = "Satellite",
    frameTickState: State<Long>,
    isGuest: Boolean = false,
    guestDaysRemaining: Int = 3,
    onLinkGoogleAccount: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    @Suppress("UNUSED_VARIABLE")
        val dummy = 0 // Remove frameTickState.value read to prevent full UI recomposition
    var showDebugHitboxes by remember { mutableStateOf(false) }

    Box(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        // TOP CONTROL TOOLBAR
        Row(
            modifier = Modifier
                .align(Alignment.TopCenter)
                .fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Left Group: Camera & Map 3D Controls
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                // Camera Mode Selector (Cockpit, Chase, Top-Down, Orbit)
                FlightMomentaryButton(
                    getState = { camera.isTransitioning },
                    onPress = { camera.cycleCameraMode() },
                    onRelease = {},
                    activeColor = Color(0xFF381E72),
                    inactiveColor = Color(0xCC1C1B1F),
                    activeTextColor = Color(0xFFD0BCFF),
                    inactiveTextColor = Color(0xFFD0BCFF),
                    modifier = Modifier.testTag("camera_mode_button").debugHitbox(showDebugHitboxes).height(36.dp)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(horizontal = 12.dp)) {
                        Icon(Icons.Default.CameraAlt, contentDescription = "Camera", modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(4.dp))
                        Text(
                            text = if (camera.isTransitioning) "TRANSITIONING..." else camera.mode.label,
                            fontSize = 11.sp
                        )
                    }
                }
                
                // 3D Map Location Selector Button
                Button(
                    onClick = onToggleLocationDialog,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color(0xCC1C1B1F),
                        contentColor = Color(0xFFE6E1E5)
                    ),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.height(36.dp).debugHitbox(showDebugHitboxes)
                ) {
                    Icon(Icons.Default.LocationOn, contentDescription = "Location", modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                    Text(currentLocationName, fontSize = 11.sp)
                }

                // Airports & Route Plan Button
                Button(
                    onClick = onToggleAirportDialog,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color(0xCC381E72),
                        contentColor = Color(0xFFD0BCFF)
                    ),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.height(36.dp).testTag("airports_button").debugHitbox(showDebugHitboxes)
                ) {
                    Icon(Icons.Default.FlightTakeoff, contentDescription = "Airports", modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Airports", fontSize = 11.sp)
                }

                // Guest Link Google Account Chip
                if (isGuest) {
                    Button(
                        onClick = onLinkGoogleAccount,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Color(0xFFD97706),
                            contentColor = Color.White
                        ),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.height(36.dp).testTag("guest_link_google_chip").debugHitbox(showDebugHitboxes)
                    ) {
                        Text(
                            text = "LINK GOOGLE ($guestDaysRemaining D LEFT)",
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }

                // Online Multiplayer Lobby Button
                Button(
                    onClick = {
                        if (isGuest) {
                            onLinkGoogleAccount()
                        } else {
                            onToggleMultiplayerDialog()
                        }
                    },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (isMultiplayerActive) Color(0xDD0284C7) else Color(0xCC1C1B1F),
                        contentColor = if (isMultiplayerActive) Color.White else Color(0xFFE6E1E5)
                    ),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.height(36.dp).testTag("multiplayer_button").debugHitbox(showDebugHitboxes)
                ) {
                    Icon(
                        imageVector = Icons.Default.Public,
                        contentDescription = "Online Multiplayer",
                        tint = if (isMultiplayerActive) Color(0xFF4ADE80) else Color(0xFFE6E1E5),
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(Modifier.width(4.dp))
                    Text(
                        text = if (isGuest) "MULTIPLAYER" else if (isMultiplayerActive) "ONLINE ($onlinePlayerCount)" else "ONLINE",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold
                    )
                }

                // Map Style
                Button(
                    onClick = onToggleMapType,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color(0xCC1C1B1F),
                        contentColor = Color(0xFFE6E1E5)
                    ),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.height(36.dp).debugHitbox(showDebugHitboxes)
                ) {
                    Icon(Icons.Default.Layers, contentDescription = "Map Style", modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                    Text(mapTypeLabel, fontSize = 11.sp)
                }

                // Real World Layer Toggle Button
                IconButton(
                    onClick = onToggleRealWorldMap,
                    modifier = Modifier
                        .background(if (isRealWorldMapMode) Color(0xFF381E72) else Color(0xCC1C1B1F), CircleShape)
                        .testTag("toggle_real_world_map_button").debugHitbox(showDebugHitboxes)
                ) {
                    Icon(
                        Icons.Default.Public,
                        contentDescription = "Map Layer",
                        tint = if (isRealWorldMapMode) Color(0xFFD0BCFF) else Color(0xFF938F99),
                        modifier = Modifier.size(18.dp)
                    )
                }

                // Minimap Toggle Button
                IconButton(
                    onClick = onToggleMinimap,
                    modifier = Modifier
                        .background(if (showMinimap) Color(0xFF381E72) else Color(0xCC1C1B1F), CircleShape)
                        .testTag("toggle_minimap_button").debugHitbox(showDebugHitboxes)
                ) {
                    Icon(
                        Icons.Default.Map,
                        contentDescription = "Minimap",
                        tint = if (showMinimap) Color(0xFFD0BCFF) else Color(0xFF938F99),
                        modifier = Modifier.size(18.dp)
                    )
                }

                // Low-Light / Night Mode Toggle Button for Runway Lighting
                IconButton(
                    onClick = onToggleLowLightMode,
                    modifier = Modifier
                        .background(if (isLowLightMode) Color(0xFF381E72) else Color(0xCC1C1B1F), CircleShape)
                        .testTag("toggle_low_light_button").debugHitbox(showDebugHitboxes)
                ) {
                    Icon(
                        Icons.Default.NightsStay,
                        contentDescription = "Night / Low-Light Lighting",
                        tint = if (isLowLightMode) Color(0xFFD0BCFF) else Color(0xFF938F99),
                        modifier = Modifier.size(18.dp)
                    )
                }

                // ILS Glide Slope Visual Indicator Toggle Button
                IconButton(
                    onClick = onToggleIls,
                    modifier = Modifier
                        .background(if (isIlsActive) Color(0xFF005B66) else Color(0xCC1C1B1F), CircleShape)
                        .testTag("toggle_ils_button").debugHitbox(showDebugHitboxes)
                ) {
                    Icon(
                        Icons.Default.FlightLand,
                        contentDescription = "ILS Glide Slope Indicator",
                        tint = if (isIlsActive) Color(0xFF00E5FF) else Color(0xFF938F99),
                        modifier = Modifier.size(18.dp)
                    )
                }
            }

            // Right Group: Diagnostics & Tools
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                // Reset Flight Button
                IconButton(
                    onClick = onResetFlight,
                    modifier = Modifier.background(Color(0xCC1C1B1F), CircleShape).testTag("reset_flight_button").debugHitbox(showDebugHitboxes)
                ) {
                    Icon(Icons.Default.Refresh, contentDescription = "Reset Flight", tint = Color(0xFFE6E1E5))
                }

                // Autopilot Toggle Button
                Button(
                    onClick = {
                        physics.isAutopilotEnabled = !physics.isAutopilotEnabled
                        if (physics.isAutopilotEnabled) {
                            physics.autopilotTargetHeadingRad = physics.yawRad
                            physics.autopilotTargetAltitudeMeters = physics.position.y
                        }
                    },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (physics.isAutopilotEnabled) Color(0xFF381E72) else Color(0xCC1C1B1F),
                        contentColor = if (physics.isAutopilotEnabled) Color(0xFFD0BCFF) else Color(0xFFE6E1E5)
                    ),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.height(36.dp).testTag("autopilot_button").debugHitbox(showDebugHitboxes)
                ) {
                    Icon(Icons.Default.Flight, contentDescription = "Autopilot", modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                    Text(if (physics.isAutopilotEnabled) "AP: ON" else "AP", fontSize = 11.sp)
                }

                // Aircraft Selection
                Button(
                    onClick = onToggleAircraftDialog,
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xCC1C1B1F), contentColor = Color(0xFFE6E1E5)),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.height(36.dp).testTag("aircraft_select_button").debugHitbox(showDebugHitboxes)
                ) {
                    Icon(Icons.Default.Flight, contentDescription = "Aircraft", modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                    Text(physics.config.name, fontSize = 11.sp)
                }

                                // Debug Hitboxes Toggle
                IconButton(
                    onClick = { showDebugHitboxes = !showDebugHitboxes },
                    modifier = Modifier.background(if (showDebugHitboxes) Color(0xFFB3261E) else Color(0xCC1C1B1F), CircleShape).testTag("toggle_debug_hitboxes_button").debugHitbox(showDebugHitboxes)
                ) {
                    Icon(Icons.Default.BugReport, contentDescription = "Debug Hitboxes", tint = Color(0xFFE6E1E5))
                }

                // Physics Sandbox Toggle
                IconButton(
                    onClick = onTogglePhysicsPanel,
                    modifier = Modifier.background(Color(0xCC1C1B1F), CircleShape).testTag("toggle_physics_panel_button").debugHitbox(showDebugHitboxes)
                ) {
                    Icon(Icons.Default.Tune, contentDescription = "Physics Sandbox", tint = Color(0xFFE6E1E5))
                }
            }
        }

        // LEFT SIDE: THROTTLE LEVER & AFTERBURNER
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(bottom = 24.dp, start = 24.dp)
                .background(Color(0xCC1C1B1F), RoundedCornerShape(20.dp))
                .border(1.dp, Color(0x33D0BCFF), RoundedCornerShape(20.dp))
                .padding(12.dp)
        ) {
            Text(
                text = "PWR ${(physics.throttle * 100).toInt()}%",
                color = if (physics.isAfterburner) Color(0xFFF2B8B5) else Color(0xFFD0BCFF),
                fontSize = 11.sp,
                style = MaterialTheme.typography.labelSmall
            )

            TouchSliderVertical(
                value = physics.throttle,
                onValueChange = { physics.throttle = it },
                modifier = Modifier
                    .height(200.dp)
                    .width(64.dp) // wide touch target
                    .padding(vertical = 8.dp)
                    .testTag("throttle_slider").debugHitbox(showDebugHitboxes),
                thumbColor = if (physics.isAfterburner) Color(0xFFF2B8B5) else Color(0xFFD0BCFF),
                trackColor = Color(0xFF4A4458)
            )

            // Afterburner Toggle
            FlightToggleButton(
                getState = { physics.isAfterburner },
                onToggle = { physics.isAfterburner = !physics.isAfterburner },
                activeColor = Color(0xFFB3261E),
                inactiveColor = Color(0xFF4A4458),
                activeTextColor = Color(0xFFE6E1E5),
                inactiveTextColor = Color(0xFFE6E1E5),
                modifier = Modifier.size(64.dp).testTag("afterburner_button").debugHitbox(showDebugHitboxes)
            ) {
                Text("BURN", fontSize = 10.sp)
            }
        }

        // BOTTOM CENTER: RUDDER YAW CONTROL
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 24.dp)
                .background(Color(0xCC1C1B1F), RoundedCornerShape(20.dp))
                .border(1.dp, Color(0x33D0BCFF), RoundedCornerShape(20.dp))
                .padding(12.dp)
        ) {
            Text("RUDDER YAW", color = Color(0xFFCCC2DC), fontSize = 10.sp)
            TouchSliderHorizontal(
                value = physics.yawInput,
                onValueChange = { physics.yawInput = it },
                onDragEnd = { physics.yawInput = 0f },
                modifier = Modifier
                    .width(300.dp)
                    .height(64.dp) // big touch target
                    .padding(top = 8.dp)
                    .testTag("rudder_slider").debugHitbox(showDebugHitboxes),
                thumbColor = Color(0xFFD0BCFF),
                trackColor = Color(0xFF4A4458)
            )
        }

        // RIGHT SIDE: BUTTONS & VIRTUAL STICK
        Row(
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(bottom = 24.dp, end = 24.dp),
            verticalAlignment = Alignment.Bottom,
            horizontalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // SYSTEM TOGGLES (Grid-like column)
            Column(
                verticalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier
                    .background(Color(0xCC1C1B1F), RoundedCornerShape(20.dp))
                    .border(1.dp, Color(0x33D0BCFF), RoundedCornerShape(20.dp))
                    .padding(12.dp)
            ) {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    // Wheel Brakes Toggle / Hold
                    FlightMomentaryButton(
                        getState = { physics.isWheelBrakesActive || physics.isParkingBrakeSet },
                        onPress = { 
                            physics.isParkingBrakeSet = false
                            physics.isWheelBrakesActive = true
                        },
                        onRelease = {
                            physics.isWheelBrakesActive = false
                        },
                        activeColor = Color(0xFFE06D53),
                        inactiveColor = Color(0xFF4A4458),
                        activeTextColor = Color.White,
                        inactiveTextColor = Color.White,
                        modifier = Modifier.size(72.dp).testTag("wheel_brakes_button").debugHitbox(showDebugHitboxes)
                    ) {
                        Text(
                            if (physics.isParkingBrakeSet) "P-BRAKE" else if (physics.isWheelBrakesActive) "BRAKES\nON" else "BRAKES",
                            fontSize = 10.sp,
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center
                        )
                    }

                    // Flaps Toggle
                    FlightToggleButton(
                        getState = { physics.isFlapsDeployed },
                        onToggle = { physics.isFlapsDeployed = !physics.isFlapsDeployed },
                        activeColor = Color(0xFFD0BCFF),
                        inactiveColor = Color(0xFF4A4458),
                        activeTextColor = Color(0xFF381E72),
                        inactiveTextColor = Color(0xFFE6E1E5),
                        modifier = Modifier.size(72.dp).testTag("flaps_button").debugHitbox(showDebugHitboxes)
                    ) {
                        Text(if (physics.isFlapsDeployed) "FLAPS\nDN" else "FLAPS\nUP", fontSize = 10.sp, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                    }
                }

                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    // Speedbrake / Spoilers
                    FlightToggleButton(
                        getState = { physics.isAirbrakeDeployed },
                        onToggle = { physics.isAirbrakeDeployed = !physics.isAirbrakeDeployed },
                        activeColor = Color(0xFFCCC2DC),
                        inactiveColor = Color(0xFF4A4458),
                        activeTextColor = Color(0xFF332D41),
                        inactiveTextColor = Color(0xFFE6E1E5),
                        modifier = Modifier.size(72.dp).testTag("airbrake_button").debugHitbox(showDebugHitboxes)
                    ) {
                        Text(if (physics.isAirbrakeDeployed) "SPOILER" else "AIRBRAKE", fontSize = 9.sp)
                    }

                    // Landing Gear
                    FlightToggleButton(
                        getState = { physics.isLandingGearDown },
                        onToggle = { physics.isLandingGearDown = !physics.isLandingGearDown },
                        activeColor = Color(0xFFD0BCFF),
                        inactiveColor = Color(0xFF4A4458),
                        activeTextColor = Color(0xFF381E72),
                        inactiveTextColor = Color(0xFFE6E1E5),
                        modifier = Modifier.size(72.dp).testTag("landing_gear_button").debugHitbox(showDebugHitboxes)
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                            Icon(
                                if (physics.isLandingGearDown) Icons.Default.FlightLand else Icons.Default.FlightTakeoff,
                                contentDescription = "Gear",
                                modifier = Modifier.size(20.dp)
                            )
                            Spacer(Modifier.height(4.dp))
                            Text(if (physics.isLandingGearDown) "GEAR DN" else "GEAR UP", fontSize = 9.sp)
                        }
                    }
                }
            }

            // TOUCH FLIGHT STICK (PITCH & ROLL)
            VirtualFlightStick(
                onStickMove = { roll, pitch ->
                    physics.rollInput = roll
                    physics.pitchInput = -pitch // Pulling stick back = Nose UP (+Pitch)
                },
                modifier = Modifier
                    .testTag("flight_stick").debugHitbox(showDebugHitboxes)
            )
        }
    }
}

@Composable
fun VirtualFlightStick(
    onStickMove: (roll: Float, pitch: Float) -> Unit,
    modifier: Modifier = Modifier
) {
    var size by remember { mutableStateOf(androidx.compose.ui.unit.IntSize.Zero) }
    val offsetX = remember { androidx.compose.animation.core.Animatable(0f) }
    val offsetY = remember { androidx.compose.animation.core.Animatable(0f) }
    val coroutineScope = androidx.compose.runtime.rememberCoroutineScope()
    val density = androidx.compose.ui.platform.LocalDensity.current.density

    androidx.compose.runtime.LaunchedEffect(Unit) {
        while (true) {
            val stickRadius = if (size.width > 0) (size.width / 2f) - (25f * density) else 1f
            val normRoll = offsetX.value / stickRadius
            val normPitch = offsetY.value / stickRadius
            onStickMove(normRoll, normPitch)
            kotlinx.coroutines.delay(16L)
        }
    }

    Box(
        modifier = modifier
            .size(160.dp)
            .background(Color(0xCC1C1B1F), CircleShape)
            .border(2.dp, Color(0x66D0BCFF), CircleShape)
            .onSizeChanged { size = it }
            .pointerInput(Unit) {
                awaitPointerEventScope {
                    while(true) {
                        val down = awaitPointerEvent(androidx.compose.ui.input.pointer.PointerEventPass.Initial).changes.firstOrNull { it.pressed && !it.isConsumed } ?: continue
                        if (!down.isConsumed) down.consume()
                        val pointerId = down.id
                        
                        val center = Offset(size.width / 2f, size.height / 2f)
                        val stickRadius = (size.width / 2f) - (25f * density) // limit to boundary
                        
                        val computeMove = { pos: Offset ->
                            coroutineScope.launch {
                                offsetX.snapTo((pos.x - center.x).coerceIn(-stickRadius, stickRadius))
                                offsetY.snapTo((pos.y - center.y).coerceIn(-stickRadius, stickRadius))
                            }
                        }
                        computeMove(down.position)

                        var isDragging = true
                        while (isDragging) {
                            val event = awaitPointerEvent(androidx.compose.ui.input.pointer.PointerEventPass.Initial)
                            val change = event.changes.firstOrNull { it.id == pointerId }
                            if (change != null) {
                                if (change.pressed) {
                                    if (change.positionChange() != Offset.Zero) {
                                        change.consume()
                                    }
                                    computeMove(change.position)
                                } else {
                                    isDragging = false
                                }
                            } else {
                                isDragging = false
                            }
                        }
                        
                        coroutineScope.launch {
                            val springSpec = androidx.compose.animation.core.spring<Float>(dampingRatio = androidx.compose.animation.core.Spring.DampingRatioMediumBouncy, stiffness = androidx.compose.animation.core.Spring.StiffnessLow)
                            launch { offsetX.animateTo(0f, animationSpec = springSpec) }
                            launch { offsetY.animateTo(0f, animationSpec = springSpec) }
                        }
                    }
                }
            },
        contentAlignment = Alignment.Center
    ) {
        Box(
            modifier = Modifier
                .width(1.dp)
                .fillMaxHeight()
                .background(Color(0x33D0BCFF))
        )
        Box(
            modifier = Modifier
                .height(1.dp)
                .fillMaxWidth()
                .background(Color(0x33D0BCFF))
        )
        Box(
            modifier = Modifier
                .offset { IntOffset(offsetX.value.roundToInt(), offsetY.value.roundToInt()) }
                .size(64.dp)
                .clip(CircleShape)
                .background(Color(0xFFD0BCFF))
                .border(2.dp, Color(0xFF1C1B1F), CircleShape)
        )
    }
}
@Composable
fun TouchSliderVertical(
    value: Float,
    onValueChange: (Float) -> Unit,
    modifier: Modifier = Modifier,
    thumbColor: Color,
    trackColor: Color,
    activeTrackColor: Color = thumbColor
) {
    var size by remember { mutableStateOf(androidx.compose.ui.unit.IntSize.Zero) }
    Box(
        modifier = modifier
            .onSizeChanged { size = it }
            .pointerInput(Unit) {
                awaitPointerEventScope {
                    while(true) {
                        val down = awaitPointerEvent(androidx.compose.ui.input.pointer.PointerEventPass.Initial).changes.firstOrNull { it.pressed && !it.isConsumed } ?: continue
                        if (!down.isConsumed) down.consume()
                        val pointerId = down.id
                        
                        val computeValue = { y: Float ->
                            val trackHeight = size.height.toFloat()
                            if (trackHeight > 0) {
                                val fraction = 1f - (y / trackHeight).coerceIn(0f, 1f)
                                onValueChange(fraction)
                            }
                        }
                        computeValue(down.position.y)
                        
                        var isDragging = true
                        while (isDragging) {
                            val event = awaitPointerEvent(androidx.compose.ui.input.pointer.PointerEventPass.Initial)
                            val change = event.changes.firstOrNull { it.id == pointerId }
                            if (change != null) {
                                if (change.pressed) {
                                    if (change.positionChange() != Offset.Zero) {
                                        change.consume()
                                    }
                                    computeValue(change.position.y)
                                } else {
                                    isDragging = false
                                }
                            } else {
                                isDragging = false
                            }
                        }
                    }
                }
            }
    ) {
        androidx.compose.foundation.Canvas(modifier = Modifier.fillMaxSize()) {
            val trackW = 8.dp.toPx()
            val thumbH = 48.dp.toPx()
            val thumbW = size.width.toFloat()
            val cx = size.width / 2f
            val drawH = size.height.toFloat()
            
            // Inactive track
            drawRoundRect(
                color = trackColor,
                topLeft = androidx.compose.ui.geometry.Offset(cx - trackW/2f, 0f),
                size = androidx.compose.ui.geometry.Size(trackW, drawH),
                cornerRadius = androidx.compose.ui.geometry.CornerRadius(trackW/2f, trackW/2f)
            )
            // Active track
            val activeH = drawH * value
            drawRoundRect(
                color = activeTrackColor,
                topLeft = androidx.compose.ui.geometry.Offset(cx - trackW/2f, drawH - activeH),
                size = androidx.compose.ui.geometry.Size(trackW, activeH),
                cornerRadius = androidx.compose.ui.geometry.CornerRadius(trackW/2f, trackW/2f)
            )
            // Thumb
            val thumbY = (drawH - thumbH) * (1f - value)
            drawRoundRect(
                color = thumbColor,
                topLeft = androidx.compose.ui.geometry.Offset(0f, thumbY),
                size = androidx.compose.ui.geometry.Size(thumbW, thumbH),
                cornerRadius = androidx.compose.ui.geometry.CornerRadius(8.dp.toPx(), 8.dp.toPx())
            )
        }
    }
}

@Composable
fun TouchSliderHorizontal(
    value: Float, // -1f to 1f
    onValueChange: (Float) -> Unit,
    onDragEnd: () -> Unit,
    modifier: Modifier = Modifier,
    thumbColor: Color,
    trackColor: Color,
    activeTrackColor: Color = thumbColor
) {
    var size by remember { mutableStateOf(androidx.compose.ui.unit.IntSize.Zero) }
    Box(
        modifier = modifier
            .onSizeChanged { size = it }
            .pointerInput(Unit) {
                awaitPointerEventScope {
                    while(true) {
                        val down = awaitPointerEvent(androidx.compose.ui.input.pointer.PointerEventPass.Initial).changes.firstOrNull { it.pressed && !it.isConsumed } ?: continue
                        if (!down.isConsumed) down.consume()
                        val pointerId = down.id
                        
                        val computeValue = { x: Float ->
                            val trackWidth = size.width.toFloat()
                            if (trackWidth > 0) {
                                val fraction = (x / trackWidth).coerceIn(0f, 1f)
                                val finalValue = (fraction * 2f) - 1f // scale to -1 to 1
                                onValueChange(finalValue)
                            }
                        }
                        computeValue(down.position.x)
                        
                        var isDragging = true
                        while (isDragging) {
                            val event = awaitPointerEvent(androidx.compose.ui.input.pointer.PointerEventPass.Initial)
                            val change = event.changes.firstOrNull { it.id == pointerId }
                            if (change != null) {
                                if (change.pressed) {
                                    if (change.positionChange() != Offset.Zero) {
                                        change.consume()
                                    }
                                    computeValue(change.position.x)
                                } else {
                                    isDragging = false
                                }
                            } else {
                                isDragging = false
                            }
                        }
                        
                        onDragEnd()
                    }
                }
            }
    ) {
        androidx.compose.foundation.Canvas(modifier = Modifier.fillMaxSize()) {
            val trackH = 8.dp.toPx()
            val thumbW = 48.dp.toPx()
            val thumbH = size.height.toFloat()
            val cy = size.height / 2f
            val drawW = size.width.toFloat()
            
            // Inactive track
            drawRoundRect(
                color = trackColor,
                topLeft = androidx.compose.ui.geometry.Offset(0f, cy - trackH/2f),
                size = androidx.compose.ui.geometry.Size(drawW, trackH),
                cornerRadius = androidx.compose.ui.geometry.CornerRadius(trackH/2f, trackH/2f)
            )
            // Active track (from center)
            val center = drawW / 2f
            val activeW = (value * center)
            if (activeW > 0) {
                drawRoundRect(
                    color = activeTrackColor,
                    topLeft = androidx.compose.ui.geometry.Offset(center, cy - trackH/2f),
                    size = androidx.compose.ui.geometry.Size(activeW, trackH),
                    cornerRadius = androidx.compose.ui.geometry.CornerRadius(trackH/2f, trackH/2f)
                )
            } else if (activeW < 0) {
                drawRoundRect(
                    color = activeTrackColor,
                    topLeft = androidx.compose.ui.geometry.Offset(center + activeW, cy - trackH/2f),
                    size = androidx.compose.ui.geometry.Size(-activeW, trackH),
                    cornerRadius = androidx.compose.ui.geometry.CornerRadius(trackH/2f, trackH/2f)
                )
            }
            // Thumb
            val norm = (value + 1f) / 2f
            val thumbX = (drawW - thumbW) * norm
            drawRoundRect(
                color = thumbColor,
                topLeft = androidx.compose.ui.geometry.Offset(thumbX, 0f),
                size = androidx.compose.ui.geometry.Size(thumbW, thumbH),
                cornerRadius = androidx.compose.ui.geometry.CornerRadius(8.dp.toPx(), 8.dp.toPx())
            )
        }
    }
}



@Composable
fun FlightToggleButton(
    getState: () -> Boolean,
    onToggle: () -> Unit,
    activeColor: Color,
    inactiveColor: Color,
    activeTextColor: Color,
    inactiveTextColor: Color,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit
) {
    var isPressed by remember { mutableStateOf(false) }
    var localActive by remember { mutableStateOf(getState()) }
    
    androidx.compose.runtime.LaunchedEffect(Unit) {
        while(true) {
            val current = getState()
            if (localActive != current) localActive = current
            kotlinx.coroutines.delay(100)
        }
    }
    
    val bgColor = if (isPressed) activeColor.copy(alpha = 0.7f) else if (localActive) activeColor else inactiveColor
    val contentColor = if (localActive) activeTextColor else inactiveTextColor

    Box(
        modifier = modifier
            .background(bgColor, RoundedCornerShape(12.dp))
            .pointerInput(Unit) {
                awaitPointerEventScope {
                    while (true) {
                        val down = awaitPointerEvent(androidx.compose.ui.input.pointer.PointerEventPass.Initial).changes.firstOrNull { it.pressed && !it.isConsumed } ?: continue
                        down.consume()
                        isPressed = true
                        onToggle()
                        localActive = getState()
                        
                        var isDragging = true
                        while (isDragging) {
                            val event = awaitPointerEvent(androidx.compose.ui.input.pointer.PointerEventPass.Initial)
                            val change = event.changes.firstOrNull { it.id == down.id }
                            if (change != null) {
                                if (change.pressed) {
                                    change.consume()
                                } else {
                                    isDragging = false
                                }
                            } else {
                                isDragging = false
                            }
                        }
                        isPressed = false
                    }
                }
            },
        contentAlignment = Alignment.Center
    ) {
        androidx.compose.runtime.CompositionLocalProvider(
            androidx.compose.material3.LocalContentColor provides contentColor,
            androidx.compose.material3.LocalTextStyle provides androidx.compose.ui.text.TextStyle(color = contentColor)
        ) {
            content()
        }
    }
}

@Composable
fun FlightMomentaryButton(
    getState: () -> Boolean,
    onPress: () -> Unit,
    onRelease: () -> Unit,
    activeColor: Color,
    inactiveColor: Color,
    activeTextColor: Color,
    inactiveTextColor: Color,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit
) {
    var isPressed by remember { mutableStateOf(false) }
    var localActive by remember { mutableStateOf(getState()) }
    
    androidx.compose.runtime.LaunchedEffect(Unit) {
        while(true) {
            val current = getState()
            if (localActive != current) localActive = current
            kotlinx.coroutines.delay(100)
        }
    }

    val displayActive = localActive || isPressed
    val bgColor = if (displayActive) activeColor else inactiveColor
    val contentColor = if (displayActive) activeTextColor else inactiveTextColor

    Box(
        modifier = modifier
            .background(bgColor, RoundedCornerShape(12.dp))
            .pointerInput(Unit) {
                awaitPointerEventScope {
                    while (true) {
                        val down = awaitPointerEvent(androidx.compose.ui.input.pointer.PointerEventPass.Initial).changes.firstOrNull { it.pressed && !it.isConsumed } ?: continue
                        down.consume()
                        isPressed = true
                        onPress()
                        localActive = getState()
                        
                        var isDragging = true
                        while (isDragging) {
                            val event = awaitPointerEvent(androidx.compose.ui.input.pointer.PointerEventPass.Initial)
                            val change = event.changes.firstOrNull { it.id == down.id }
                            if (change != null) {
                                if (change.pressed) {
                                    change.consume()
                                } else {
                                    isDragging = false
                                }
                            } else {
                                isDragging = false
                            }
                        }
                        isPressed = false
                        onRelease()
                        localActive = getState()
                    }
                }
            },
        contentAlignment = Alignment.Center
    ) {
        androidx.compose.runtime.CompositionLocalProvider(
            androidx.compose.material3.LocalContentColor provides contentColor,
            androidx.compose.material3.LocalTextStyle provides androidx.compose.ui.text.TextStyle(color = contentColor)
        ) {
            content()
        }
    }
}
