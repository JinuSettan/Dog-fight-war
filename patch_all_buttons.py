import re

with open('app/src/main/java/com/example/ui/FlightControls.kt', 'r') as f:
    content = f.read()

def replace_block(text, start_marker, end_marker, replacement):
    start = text.find(start_marker)
    if start == -1: return text
    end = text.find(end_marker, start)
    if end == -1: return text
    return text[:start] + replacement + text[end + len(end_marker):]

content = replace_block(content,
    '// Wheel Brakes Toggle / Hold',
    '}\n                    }',
    '''// Wheel Brakes Toggle / Hold
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
                    }'''
)

content = replace_block(content,
    '// Flaps Toggle',
    '}\n                }',
    '''// Flaps Toggle
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
                }'''
)

content = replace_block(content,
    '// Speedbrake / Spoilers',
    '}\n                    }',
    '''// Speedbrake / Spoilers
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
                    }'''
)

content = replace_block(content,
    '// Landing Gear',
    '}\n                    }',
    '''// Landing Gear
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
                    }'''
)

content = replace_block(content,
    '// Camera Mode Selector',
    '}\n                }',
    '''// Camera Mode Selector (Cockpit, Chase, Top-Down, Orbit)
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
                }'''
)

with open('app/src/main/java/com/example/ui/FlightControls.kt', 'w') as f:
    f.write(content)

