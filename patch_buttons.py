import re

with open('app/src/main/java/com/example/ui/FlightControls.kt', 'r') as f:
    content = f.read()

flight_button_code = """
@Composable
fun FlightToggleButton(
    isActive: Boolean,
    onToggle: () -> Unit,
    activeColor: Color,
    inactiveColor: Color,
    activeTextColor: Color,
    inactiveTextColor: Color,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit
) {
    var isPressed by remember { mutableStateOf(false) }
    
    val bgColor = if (isPressed) activeColor.copy(alpha = 0.7f) else if (isActive) activeColor else inactiveColor
    val contentColor = if (isActive) activeTextColor else inactiveTextColor

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
    isActive: Boolean,
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
    val displayActive = isActive || isPressed
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
"""

if "fun FlightToggleButton" not in content:
    content = content + "\n" + flight_button_code

# Replace buttons
content = re.sub(
    r'Button\(\s*onClick = \{\s*physics\.isParkingBrakeSet = false\s*physics\.isWheelBrakesActive = !physics\.isWheelBrakesActive\s*\},.*?Text\([^)]+\)\s*\}',
    r'''FlightMomentaryButton(
                        isActive = physics.isWheelBrakesActive || physics.isParkingBrakeSet,
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
                            if (physics.isParkingBrakeSet) "P-BRAKE" else if (physics.isWheelBrakesActive) "BRAKES\nON" else "BRAKES",
                            fontSize = 10.sp,
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center
                        )
                    }''',
    content, flags=re.DOTALL
)

content = re.sub(
    r'Button\(\s*onClick = \{\s*physics\.isFlapsDeployed = !physics\.isFlapsDeployed\s*\},.*?Text\([^)]+\)\s*\}',
    r'''FlightToggleButton(
                        isActive = physics.isFlapsDeployed,
                        onToggle = { physics.isFlapsDeployed = !physics.isFlapsDeployed },
                        activeColor = Color(0xFFD0BCFF),
                        inactiveColor = Color(0xFF4A4458),
                        activeTextColor = Color(0xFF381E72),
                        inactiveTextColor = Color(0xFFE6E1E5),
                        modifier = Modifier.size(72.dp).testTag("flaps_button")
                    ) {
                        Text(if (physics.isFlapsDeployed) "FLAPS\nDN" else "FLAPS\nUP", fontSize = 10.sp, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                    }''',
    content, flags=re.DOTALL
)

content = re.sub(
    r'Button\(\s*onClick = \{\s*physics\.isAirbrakeDeployed = !physics\.isAirbrakeDeployed\s*\},.*?Text\([^)]+\)\s*\}',
    r'''FlightToggleButton(
                        isActive = physics.isAirbrakeDeployed,
                        onToggle = { physics.isAirbrakeDeployed = !physics.isAirbrakeDeployed },
                        activeColor = Color(0xFFCCC2DC),
                        inactiveColor = Color(0xFF4A4458),
                        activeTextColor = Color(0xFF332D41),
                        inactiveTextColor = Color(0xFFE6E1E5),
                        modifier = Modifier.size(72.dp).testTag("airbrake_button")
                    ) {
                        Text(if (physics.isAirbrakeDeployed) "SPOILER" else "AIRBRAKE", fontSize = 9.sp)
                    }''',
    content, flags=re.DOTALL
)

content = re.sub(
    r'Button\(\s*onClick = \{\s*physics\.isLandingGearDown = !physics\.isLandingGearDown\s*\},.*?Text\([^)]+\)\s*\}\s*\}\s*\}',
    r'''FlightToggleButton(
                        isActive = physics.isLandingGearDown,
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
                    }''',
    content, flags=re.DOTALL
)

content = re.sub(
    r'Button\(\s*onClick = \{\s*physics\.isAfterburner = !physics\.isAfterburner\s*\},.*?Text\([^)]+\)\s*\}',
    r'''FlightToggleButton(
                isActive = physics.isAfterburner,
                onToggle = { physics.isAfterburner = !physics.isAfterburner },
                activeColor = Color(0xFFB3261E),
                inactiveColor = Color(0xFF4A4458),
                activeTextColor = Color(0xFFE6E1E5),
                inactiveTextColor = Color(0xFFE6E1E5),
                modifier = Modifier.size(64.dp).testTag("afterburner_button")
            ) {
                Text("BURN", fontSize = 10.sp)
            }''',
    content, flags=re.DOTALL
)

with open('app/src/main/java/com/example/ui/FlightControls.kt', 'w') as f:
    f.write(content)

