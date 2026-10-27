import re

with open('app/src/main/java/com/example/ui/FlightControls.kt', 'r') as f:
    content = f.read()

# I need to rewrite FlightToggleButton and FlightMomentaryButton to use getState: () -> Boolean

new_flight_button_code = """
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
"""

# Replace the previous definitions of FlightToggleButton and FlightMomentaryButton
content = re.sub(r'@Composable\nfun FlightToggleButton\(.*?fun FlightMomentaryButton\(.*?\n\}\n', new_flight_button_code, content, flags=re.DOTALL)

# Now fix the usages.
content = content.replace('isActive = physics.isWheelBrakesActive || physics.isParkingBrakeSet,', 'getState = { physics.isWheelBrakesActive || physics.isParkingBrakeSet },')
content = content.replace('isActive = physics.isFlapsDeployed,', 'getState = { physics.isFlapsDeployed },')
content = content.replace('isActive = physics.isAirbrakeDeployed,', 'getState = { physics.isAirbrakeDeployed },')
content = content.replace('isActive = physics.isLandingGearDown,', 'getState = { physics.isLandingGearDown },')
content = content.replace('isActive = physics.isAfterburner,', 'getState = { physics.isAfterburner },')
content = content.replace('isActive = camera.isTransitioning,', 'getState = { camera.isTransitioning },')

with open('app/src/main/java/com/example/ui/FlightControls.kt', 'w') as f:
    f.write(content)

