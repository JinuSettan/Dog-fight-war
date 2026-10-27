import re

with open('app/src/main/java/com/example/ui/FlightControls.kt', 'r') as f:
    content = f.read()

# The function to replace is FlightControlsOverlay

new_overlay = """@Composable
fun FlightControlsOverlay(
    physics: AerodynamicsEngine,
    camera: Camera3D,
    onResetFlight: () -> Unit,
    onTogglePhysicsPanel: () -> Unit,
    onToggleAircraftDialog: () -> Unit,
    onToggleLocationDialog: () -> Unit = {},
    onToggleMapType: () -> Unit = {},
    onToggleRealWorldMap: () -> Unit = {},
    onToggleMinimap: () -> Unit = {},
    showMinimap: Boolean = true,
    isRealWorldMapMode: Boolean = true,
    currentLocationName: String = "San Francisco Bay",
    mapTypeLabel: String = "Satellite",
    frameTickState: State<Long>,
    modifier: Modifier = Modifier
) {
    @Suppress("UNUSED_VARIABLE")
    val dummy = 0 // Remove frameTickState.value read to prevent full UI recomposition

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
                    modifier = Modifier.testTag("camera_mode_button").height(36.dp)
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
                    modifier = Modifier.height(36.dp)
                ) {
                    Icon(Icons.Default.LocationOn, contentDescription = "Location", modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                    Text(currentLocationName, fontSize = 11.sp)
                }

                // Map Style
                Button(
                    onClick = onToggleMapType,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color(0xCC1C1B1F),
                        contentColor = Color(0xFFE6E1E5)
                    ),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.height(36.dp)
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
                        .testTag("toggle_real_world_map_button")
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
                        .testTag("toggle_minimap_button")
                ) {
                    Icon(
                        Icons.Default.Map,
                        contentDescription = "Minimap",
                        tint = if (showMinimap) Color(0xFFD0BCFF) else Color(0xFF938F99),
                        modifier = Modifier.size(18.dp)
                    )
                }
            }

            // Right Group: Diagnostics & Tools
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                // Reset Flight Button
                IconButton(
                    onClick = onResetFlight,
                    modifier = Modifier.background(Color(0xCC1C1B1F), CircleShape).testTag("reset_flight_button")
                ) {
                    Icon(Icons.Default.Refresh, contentDescription = "Reset Flight", tint = Color(0xFFE6E1E5))
                }

                // Aircraft Selection
                Button(
                    onClick = onToggleAircraftDialog,
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xCC1C1B1F), contentColor = Color(0xFFE6E1E5)),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.height(36.dp).testTag("aircraft_select_button")
                ) {
                    Icon(Icons.Default.Flight, contentDescription = "Aircraft", modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                    Text(physics.config.name, fontSize = 11.sp)
                }

                // Physics Sandbox Toggle
                IconButton(
                    onClick = onTogglePhysicsPanel,
                    modifier = Modifier.background(Color(0xCC1C1B1F), CircleShape).testTag("toggle_physics_panel_button")
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
                    .testTag("throttle_slider"),
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
                modifier = Modifier.size(64.dp).testTag("afterburner_button")
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
                    .testTag("rudder_slider"),
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
                        modifier = Modifier.size(72.dp).testTag("wheel_brakes_button")
                    ) {
                        Text(
                            if (physics.isParkingBrakeSet) "P-BRAKE" else if (physics.isWheelBrakesActive) "BRAKES\\nON" else "BRAKES",
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
                        modifier = Modifier.size(72.dp).testTag("flaps_button")
                    ) {
                        Text(if (physics.isFlapsDeployed) "FLAPS\\nDN" else "FLAPS\\nUP", fontSize = 10.sp, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
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
                        modifier = Modifier.size(72.dp).testTag("airbrake_button")
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
                        modifier = Modifier.size(72.dp).testTag("landing_gear_button")
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
                    .testTag("flight_stick")
            )
        }
    }
}"""

pattern = re.compile(r'@Composable\s*fun FlightControlsOverlay\(.*?fun VirtualFlightStick\(', re.DOTALL)
new_content = re.sub(pattern, new_overlay + "\n\n@Composable\nfun VirtualFlightStick(", content)

with open('app/src/main/java/com/example/ui/FlightControls.kt', 'w') as f:
    f.write(new_content)

